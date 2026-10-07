# ---------------------------------------------------------------------------
# Amazon SES: verify the sending domain (taken from email_from) and set up DKIM.
# With a Route 53 zone the verification records are created here; otherwise add
# the records from the "ses_dns_records" output at your DNS provider.
#
# Note: new AWS accounts start in the SES sandbox (only verified recipients,
# low quota). Request production access in the SES console before go-live.
# ---------------------------------------------------------------------------
resource "aws_ses_domain_identity" "main" {
  domain = local.email_domain
}

resource "aws_ses_domain_dkim" "main" {
  domain = aws_ses_domain_identity.main.domain
}

# Domain ownership proof: TXT _amazonses.<domain>
resource "aws_route53_record" "ses_verification" {
  count = local.create_dns ? 1 : 0

  zone_id = var.route53_zone_id
  name    = "_amazonses.${local.email_domain}"
  type    = "TXT"
  ttl     = 600
  records = [aws_ses_domain_identity.main.verification_token]
}

# DKIM signing: three CNAMEs <token>._domainkey.<domain>
resource "aws_route53_record" "ses_dkim" {
  count = local.create_dns ? 3 : 0

  zone_id = var.route53_zone_id
  name    = "${aws_ses_domain_dkim.main.dkim_tokens[count.index]}._domainkey.${local.email_domain}"
  type    = "CNAME"
  ttl     = 600
  records = ["${aws_ses_domain_dkim.main.dkim_tokens[count.index]}.dkim.amazonses.com"]
}
