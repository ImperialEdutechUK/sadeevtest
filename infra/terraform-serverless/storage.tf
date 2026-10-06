# ---------------------------------------------------------------------------
# S3 buckets:
#   - uploads: meeting recordings and documents (browser uploads via presigned
#     URLs) plus Amazon Transcribe output. Private, encrypted, lifecycle-expired.
#   - web: the built SPA, served only through CloudFront (origin access control).
#
# Cost: storage at a few pence per GB-month plus requests; no fixed charges.
# ---------------------------------------------------------------------------

# --- Uploads bucket ----------------------------------------------------------

resource "aws_s3_bucket" "uploads" {
  bucket = local.uploads_bucket_name

  tags = { Name = local.uploads_bucket_name }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Disabled"
  }
}

# Browsers PUT directly to presigned URLs from the web origin, so the bucket must
# answer CORS preflights for that origin and expose ETag (used to confirm uploads).
resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = [local.web_origin]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  # Recordings are personal data: delete them after the retention period.
  # recording_retention_days = 0 disables the rule (keeps recordings forever).
  rule {
    id     = "expire-recordings"
    status = var.recording_retention_days > 0 ? "Enabled" : "Disabled"

    filter {
      prefix = "recordings/"
    }

    expiration {
      days = max(var.recording_retention_days, 1)
    }
  }

  # Raw Transcribe JSON is only needed until the analysis has run.
  rule {
    id     = "expire-transcribe-output"
    status = "Enabled"

    filter {
      prefix = "transcribe-output/"
    }

    expiration {
      days = 30
    }
  }

  # Clean up abandoned multipart uploads so they do not accrue storage charges.
  rule {
    id     = "abort-incomplete-multipart-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.uploads]
}

# Refuse any unencrypted (plain HTTP) access to the uploads bucket.
data "aws_iam_policy_document" "uploads_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.uploads.arn,
      "${aws_s3_bucket.uploads.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = data.aws_iam_policy_document.uploads_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.uploads]
}

# --- Web (static SPA) bucket ----------------------------------------------------

resource "aws_s3_bucket" "web" {
  bucket = local.web_bucket_name

  tags = { Name = local.web_bucket_name }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Only the CloudFront distribution (via origin access control) may read objects.
data "aws_iam_policy_document" "web_bucket" {
  statement {
    sid       = "AllowCloudFrontServicePrincipalReadOnly"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.web]
}
