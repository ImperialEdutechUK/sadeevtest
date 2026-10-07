# ---------------------------------------------------------------------------
# Route 53 records - only when route53_zone_id is set. If DNS is managed
# elsewhere, create the records by hand from the "dns_records_to_create" output.
# ---------------------------------------------------------------------------

# Web app (and API under /api) -> CloudFront. CloudFront is dual-stack, so A + AAAA.
resource "aws_route53_record" "web_a" {
  count = local.create_dns ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "web_aaaa" {
  count = local.create_dns ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

# Optional direct API hostname -> ALB. The ALB is IPv4-only (the VPC has no IPv6), so A only.
resource "aws_route53_record" "api_a" {
  count = local.create_dns && local.create_direct_api ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.api_domain_name
  type    = "A"

  alias {
    name                   = aws_lb.api.dns_name
    zone_id                = aws_lb.api.zone_id
    evaluate_target_health = true
  }
}
