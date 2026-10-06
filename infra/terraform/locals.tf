# ---------------------------------------------------------------------------
# Shared values and lookups
# ---------------------------------------------------------------------------
data "aws_caller_identity" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Prefix for every resource name, e.g. "meeting-review-prod"
  name       = "${var.project_name}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id

  # Two availability zones are enough for an ALB and RDS subnet group.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  # The SPA and the API share one origin: https://<domain_name> and https://<domain_name>/api
  web_origin     = "https://${var.domain_name}"
  api_public_url = "https://${var.domain_name}/api"
  api_direct_url = var.api_domain_name != "" ? "https://${var.api_domain_name}" : null

  create_dns        = var.route53_zone_id != ""
  create_direct_api = var.api_domain_name != ""

  # Domain part of email_from, e.g. "example.ac.uk" from "Meeting Review <no-reply@example.ac.uk>"
  email_domain = regex("@([A-Za-z0-9.-]+)", var.email_from)[0]

  # S3 bucket names must be globally unique, hence the account id suffix.
  uploads_bucket_name = "${local.name}-uploads-${local.account_id}"
  web_bucket_name     = "${local.name}-web-${local.account_id}"

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}
