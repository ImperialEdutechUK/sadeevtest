# ---------------------------------------------------------------------------
# CloudFront: one distribution, one public hostname, two origins.
#
#   https://<domain_name>/*       -> S3 web bucket (the SPA), cached at the edge
#   https://<domain_name>/api/*   -> Lambda function URL (the API), never cached
#
# Browser and API share a single origin, so auth cookies are same-site and no
# CORS configuration is needed between them. CloudFront adds a secret
# X-Origin-Verify header on the way to the function URL and the API returns 403
# to any request without it (env ORIGIN_VERIFY_SECRET), so the public function
# URL cannot be used to bypass CloudFront.
#
# The function URL uses auth type NONE on purpose: with Lambda OAC / IAM auth,
# CloudFront requires browsers to send x-amz-content-sha256 on requests with a
# body, which the SPA does not do.
#
# Cost: CloudFront's always-free tier covers 1 TB out, 10 M requests and 2 M
# CloudFront Function invocations per month; ACM certificates are free.
# ---------------------------------------------------------------------------

# --- AWS managed policies (looked up by name, no magic IDs) -------------------

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards all viewer headers EXCEPT Host, plus cookies and query strings. The
# function URL only answers for its own hostname, so the viewer's Host header
# must not be forwarded (CloudFront sets Host to the origin domain instead).
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "security_headers" {
  name = "Managed-SecurityHeadersPolicy"
}

# --- TLS certificate (us-east-1) -------------------------------------------------
# Either supplied (acm_certificate_arn_us_east_1) or requested here. With a Route 53
# zone the validation record is created in dns.tf and the apply waits for issuance;
# without one, add the CNAME from output acm_validation_record (see README).

resource "aws_acm_certificate" "cloudfront" {
  count    = local.create_certificate ? 1 : 0
  provider = aws.us_east_1

  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${local.name}-cloudfront" }
}

resource "aws_acm_certificate_validation" "cloudfront" {
  count    = local.create_certificate && local.create_dns ? 1 : 0
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.cloudfront[0].arn
  validation_record_fqdns = [aws_route53_record.acm_validation[0].fqdn]
}

locals {
  cloudfront_certificate_arn = (
    !local.create_certificate ? var.acm_certificate_arn_us_east_1 :
    local.create_dns ? aws_acm_certificate_validation.cloudfront[0].certificate_arn :
    aws_acm_certificate.cloudfront[0].arn
  )

  # "https://abc123.lambda-url.eu-west-2.on.aws/" -> "abc123.lambda-url.eu-west-2.on.aws"
  api_origin_domain = trimsuffix(trimprefix(aws_lambda_function_url.api.function_url, "https://"), "/")
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
  comment             = "${local.name} - web app and API (serverless)"
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

  # Origin 2: the API Lambda's function URL, HTTPS only
  origin {
    origin_id   = "lambda-api"
    domain_name = local.api_origin_domain

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60 # CloudFront's maximum without a quota increase; matches the API timeout
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

  # The API: all methods, no caching, all headers (but Host), cookies and query strings forwarded
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "lambda-api"
    viewer_protocol_policy = "https-only"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    compress               = false

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = local.cloudfront_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${local.name}-web" }
}
