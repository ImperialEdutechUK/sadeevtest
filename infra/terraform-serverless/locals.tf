# ---------------------------------------------------------------------------
# Shared values and lookups
# ---------------------------------------------------------------------------
data "aws_caller_identity" "current" {}

# Only consulted in aurora mode (two public subnets for the DB subnet group).
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Prefix for every resource name, e.g. "meeting-review-prod"
  name       = "${var.project_name}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id

  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  # The SPA and the API share one origin: https://<domain_name> and https://<domain_name>/api
  web_origin     = "https://${var.domain_name}"
  api_public_url = "https://${var.domain_name}/api"

  create_dns         = var.route53_zone_id != ""
  create_certificate = var.acm_certificate_arn_us_east_1 == ""
  create_aurora      = var.database_mode == "aurora_serverless_v2"

  # Domain part of email_from, e.g. "example.ac.uk" from "Meeting Review <no-reply@example.ac.uk>"
  email_domain = regex("@([A-Za-z0-9.-]+)", var.email_from)[0]

  # SES identity the functions may send from - created here or pre-existing in the account.
  ses_identity_arn = var.create_ses_domain_identity ? aws_ses_domain_identity.main[0].arn : "arn:aws:ses:${var.aws_region}:${local.account_id}:identity/${local.email_domain}"

  # S3 bucket names must be globally unique, hence the account id suffix.
  uploads_bucket_name = "${local.name}-uploads-${local.account_id}"
  web_bucket_name     = "${local.name}-web-${local.account_id}"

  # SSM Parameter Store path shared by all secrets: /meeting-review/prod/<NAME>
  ssm_prefix = "/${var.project_name}/${var.environment}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Profile     = "serverless"
    },
    var.tags,
  )
}
