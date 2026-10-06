# ---------------------------------------------------------------------------
# GitHub Actions deploys without long-lived AWS keys: workflows in the named
# repository/branch exchange their OIDC token for this role.
# Store the role ARN in the GitHub secret AWS_DEPLOY_ROLE_ARN.
#
# The role can do exactly three things: publish the SPA to the web bucket,
# invalidate the CloudFront cache and update the code of the three functions.
# Database migrations and seeding run in the workflow with the DATABASE_URL
# GitHub secret, so the role needs no SSM or database access.
# ---------------------------------------------------------------------------

# An account can hold only one provider for the GitHub URL. Create it here, or
# look up the existing one when create_github_oidc_provider = false.
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]

  # AWS now validates GitHub's certificate chain itself; the thumbprints are still
  # required by the API. These are GitHub's published values.
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1

  url = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_provider_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

# --- Trust policy: only this repo, only this branch ------------------------------

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/${var.github_deploy_branch}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${local.name}-github-deploy"
  description          = "Assumed by GitHub Actions in ${var.github_repository} to deploy ${local.name}"
  assume_role_policy   = data.aws_iam_policy_document.github_assume.json
  max_session_duration = 3600
}

# --- Permissions: exactly what the deploy workflow needs ---------------------------

data "aws_iam_policy_document" "github_deploy" {
  # Upload the SPA build
  statement {
    sid       = "WebBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.web.arn]
  }

  statement {
    sid       = "WebBucketObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
  }

  # Flush the CDN cache after an upload
  statement {
    sid       = "CloudFrontInvalidate"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetInvalidation"]
    resources = [aws_cloudfront_distribution.web.arn]
  }

  # Ship a new bundle to the three functions and wait for the update to finish
  statement {
    sid = "LambdaDeployCode"
    actions = [
      "lambda:UpdateFunctionCode",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
    ]
    resources = [
      aws_lambda_function.api.arn,
      aws_lambda_function.worker.arn,
      aws_lambda_function.scheduled.arn,
    ]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy-permissions"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
