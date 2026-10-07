# ---------------------------------------------------------------------------
# Application secrets in AWS Secrets Manager. The ECS task execution role
# reads them at container start; they never appear in the task definition.
# (DATABASE_URL lives in database.tf next to the database it describes.)
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

# Initial admin password: meets common complexity rules, no shell/URL-hostile characters.
resource "random_password" "seed_admin_password" {
  length           = 20
  special          = true
  override_special = "!#-_"
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
  min_special      = 1
}

# Shared secret that CloudFront adds to every request it sends to the ALB (header
# X-Origin-Verify). The ALB listener only forwards requests that carry it, so the
# API cannot be reached by going around CloudFront. Alphanumeric only: ALB rule
# values treat * and ? as wildcards.
resource "random_password" "origin_verify" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${local.name}/jwt-secret"
  description             = "JWT signing secret for the ${local.name} API"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

resource "aws_secretsmanager_secret" "cookie_secret" {
  name                    = "${local.name}/cookie-secret"
  description             = "Cookie signing secret for the ${local.name} API"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "cookie_secret" {
  secret_id     = aws_secretsmanager_secret.cookie_secret.id
  secret_string = random_password.cookie_secret.result
}

resource "aws_secretsmanager_secret" "seed_admin_password" {
  name                    = "${local.name}/seed-admin-password"
  description             = "Password of the first administrator created by the seed task"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "seed_admin_password" {
  secret_id     = aws_secretsmanager_secret.seed_admin_password.id
  secret_string = random_password.seed_admin_password.result
}

# --- Secrets supplied by the team ----------------------------------------------

# Created with a placeholder. Paste the real key in the console (or with the CLI,
# see README) - Terraform will never overwrite it thanks to ignore_changes.
resource "aws_secretsmanager_secret" "openrouter_api_key" {
  name                    = "${local.name}/openrouter-api-key"
  description             = "OpenRouter API key used by the ${local.name} API (set manually)"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "openrouter_api_key" {
  secret_id     = aws_secretsmanager_secret.openrouter_api_key.id
  secret_string = "REPLACE_ME_IN_AWS_CONSOLE"

  lifecycle {
    ignore_changes = [secret_string]
  }
}
