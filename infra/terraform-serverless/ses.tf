# ---------------------------------------------------------------------------
# Amazon SES: verify the sending domain (taken from email_from) and set up DKIM.
# Skipped when create_ses_domain_identity = false (identity already exists in
# this account/region, e.g. created by ../terraform); the functions' IAM policy
# then references it by ARN (locals.tf).
#
# Note: new AWS accounts start in the SES sandbox (only verified recipients,
# low quota). Request production access in the SES console before go-live.
# Cost: USD 0.10 per 1,000 emails; the identity itself is free.
# ---------------------------------------------------------------------------
resource "aws_ses_domain_identity" "main" {
  count = var.create_ses_domain_identity ? 1 : 0

  domain = local.email_domain
}

resource "aws_ses_domain_dkim" "main" {
  count = var.create_ses_domain_identity ? 1 : 0

  domain = aws_ses_domain_identity.main[0].domain
}
