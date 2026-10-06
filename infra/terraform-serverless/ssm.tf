# ---------------------------------------------------------------------------
# Secrets in SSM Parameter Store (SecureString, Standard tier - free, encrypted
# with the AWS-managed key alias/aws/ssm).
#
#   /<project>/<env>/DATABASE_URL          external mode: created by the team
#                                          aurora mode:   created in database.tf
#   /<project>/<env>/JWT_SECRET            generated here
#   /<project>/<env>/COOKIE_SECRET         generated here
#   /<project>/<env>/ORIGIN_VERIFY_SECRET  generated here (shared with CloudFront)
#   /<project>/<env>/OPENROUTER_API_KEY    placeholder - paste the real key, never overwritten
#
# The Lambda environment is filled from these parameters at apply time through
# data sources (lambda.tf), so the functions need no SSM permissions and no
# runtime code to fetch secrets. Re-run `terraform apply` after changing a value.
# ---------------------------------------------------------------------------

# --- Generated secrets -----------------------------------------------------------

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "cookie_secret" {
  length  = 64
  special = false
}

# Shared secret that CloudFront adds to every request it sends to the function
# URL (header X-Origin-Verify). The API rejects requests that do not carry it.
resource "random_password" "origin_verify" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "jwt_secret" {
  name        = "${local.ssm_prefix}/JWT_SECRET"
  description = "JWT signing secret for the ${local.name} API"
  type        = "SecureString"
  tier        = "Standard"
  value       = random_password.jwt_secret.result

  tags = { Name = "${local.name}-jwt-secret" }
}

resource "aws_ssm_parameter" "cookie_secret" {
  name        = "${local.ssm_prefix}/COOKIE_SECRET"
  description = "Cookie signing secret for the ${local.name} API"
  type        = "SecureString"
  tier        = "Standard"
  value       = random_password.cookie_secret.result

  tags = { Name = "${local.name}-cookie-secret" }
}

resource "aws_ssm_parameter" "origin_verify_secret" {
  name        = "${local.ssm_prefix}/ORIGIN_VERIFY_SECRET"
  description = "X-Origin-Verify header value CloudFront sends to the ${local.name} API"
  type        = "SecureString"
  tier        = "Standard"
  value       = random_password.origin_verify.result

  tags = { Name = "${local.name}-origin-verify-secret" }
}

# --- Secrets supplied by the team ----------------------------------------------

# Created with a placeholder. Paste the real key with the CLI or console (see
# README) - Terraform never overwrites it thanks to ignore_changes.
resource "aws_ssm_parameter" "openrouter_api_key" {
  name        = "${local.ssm_prefix}/OPENROUTER_API_KEY"
  description = "OpenRouter API key used by the ${local.name} API (set manually)"
  type        = "SecureString"
  tier        = "Standard"
  value       = "REPLACE_ME"

  lifecycle {
    ignore_changes = [value]
  }

  tags = { Name = "${local.name}-openrouter-api-key" }
}

# --- Read-back: the values the functions actually get -----------------------------
# Referencing the resources' names makes Terraform create/update the parameters
# first and read the live values afterwards.

data "aws_ssm_parameter" "jwt_secret" {
  name            = aws_ssm_parameter.jwt_secret.name
  with_decryption = true
}

data "aws_ssm_parameter" "cookie_secret" {
  name            = aws_ssm_parameter.cookie_secret.name
  with_decryption = true
}

data "aws_ssm_parameter" "origin_verify_secret" {
  name            = aws_ssm_parameter.origin_verify_secret.name
  with_decryption = true
}

data "aws_ssm_parameter" "openrouter_api_key" {
  name            = aws_ssm_parameter.openrouter_api_key.name
  with_decryption = true
}

# external mode: the parameter must already exist (README, bootstrap step 2) or
# the plan fails with ParameterNotFound. aurora mode: created by database.tf.
data "aws_ssm_parameter" "database_url" {
  name            = local.create_aurora ? aws_ssm_parameter.database_url[0].name : "${local.ssm_prefix}/DATABASE_URL"
  with_decryption = true
}
