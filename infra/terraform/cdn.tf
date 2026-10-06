# ---------------------------------------------------------------------------
# CloudFront: one distribution, one public hostname, two origins.
#
#   https://<domain_name>/*       -> S3 web bucket (the SPA), cached at the edge
#   https://<domain_name>/api/*   -> ALB (the API), never cached, everything forwarded
#
# Browser and API therefore share a single origin: auth cookies are same-site
# and no CORS configuration is needed between them. CloudFront adds a secret
# X-Origin-Verify header on the way to the ALB so the ALB can reject requests
# that try to bypass CloudFront (see alb.tf).
# ---------------------------------------------------------------------------

# --- AWS managed policies (looked up by name, no magic IDs) -------------------

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards ALL viewer headers (including Host), cookies and query strings.
# The viewer Host header (= domain_name) must reach the ALB: CloudFront checks the
# ALB's TLS certificate against the forwarded Host, and ACM cannot issue a
# certificate for the ALB's own *.elb.amazonaws.com name. This is why the
# regional certificate has to cover domain_name.
data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy"
}

# --- Origin access control for the private web bucket ---------------------------

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.name}-web"
  description                       = "Lets the ${local.name} distribution read the private web bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# --- SPA routing -----------------------------------------------------------------
# Any path that is not a file (no extension in its last segment) is rewritten to
# /index.html so React Router can render the route. This runs only on the web
# behaviour; distribution-wide "custom error responses" are deliberately NOT used
# because they would also turn genuine API 403/404 responses into 200 + index.html.
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${local.name}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Serve index.html for SPA routes"
  publish = true

  code = <<-EOT
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
      // Real files (anything with an extension) are served as-is.
      if (lastSegment.indexOf('.') !== -1) {
        return request;
      }
      request.uri = '/index.html';
      return request;
    }
  EOT
}

# --- The distribution --------------------------------------------------------------

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  comment             = "${local.name} - web app and API"
  aliases             = [var.domain_name]
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # edge locations in Europe and North America only
  http_version        = "http2and3"
  is_ipv6_enabled     = true

  # Origin 1: the built SPA in S3
  origin {
    origin_id                = "s3-web"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  # Origin 2: the API behind the ALB, HTTPS only
  origin {
    origin_id   = "alb-api"
    domain_name = aws_lb.api.dns_name

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  # Everything that is not /api/* is the SPA
  default_cache_behavior {
    target_origin_id       = "s3-web"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id            = data.aws_cloudfront_cache_policy.caching_optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security_headers.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # The API: all methods, no caching, all headers/cookies/query strings forwarded
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-api"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn_us_east_1
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${local.name}-web" }
}
