# ---------------------------------------------------------------------------
# Route 53 records - only when route53_zone_id points at an EXISTING hosted zone.
# No zone is created here (USD 0.50/month each). If DNS is managed elsewhere,
# create the records by hand from the outputs dns_records_to_create,
# acm_validation_record and ses_dns_records.
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

# ACM DNS validation for the certificate requested in cdn.tf (single domain, so one record).
resource "aws_route53_record" "acm_validation" {
  count = local.create_certificate && local.create_dns ? 1 : 0

  zone_id         = var.route53_zone_id
  name            = one(aws_acm_certificate.cloudfront[0].domain_validation_options).resource_record_name
  type            = one(aws_acm_certificate.cloudfront[0].domain_validation_options).resource_record_type
  ttl             = 60
  records         = [one(aws_acm_certificate.cloudfront[0].domain_validation_options).resource_record_value]
  allow_overwrite = true
}

# SES domain ownership proof: TXT _amazonses.<domain>
resource "aws_route53_record" "ses_verification" {
  count = local.create_dns && var.create_ses_domain_identity ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "_amazonses.${local.email_domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main[0].verification_token]
}

# SES DKIM signing: three CNAMEs <token>._domainkey.<domain>
resource "aws_route53_record" "ses_dkim" {
  count = local.create_dns && var.create_ses_domain_identity ? 3 : 0

  zone_id = var.route53_zone_id
  name    = "${aws_ses_domain_dkim.main[0].dkim_tokens[count.index]}._domainkey.${local.email_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main[0].dkim_tokens[count.index]}.dkim.amazonses.com"]
}
