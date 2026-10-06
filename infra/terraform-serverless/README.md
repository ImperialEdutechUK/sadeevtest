# Meeting Review - serverless AWS profile (Terraform)

A second deployment profile for the same application whose **fixed monthly
hosting cost is cents**. It uses only services that bill per request or sit
inside AWS's always-free tier, and it deliberately contains none of the hourly
items of the container stack in [`../terraform`](../terraform): no NAT gateway,
no load balancer, no ECS/Fargate, no EC2, no RDS instance, no VPC endpoints,
no RDS Proxy, no Secrets Manager, no provisioned concurrency, no paid CloudWatch
alarms or dashboards, and no Route 53 hosted zone (an existing one is optional).

| Area | Resources |
| --- | --- |
| Web | Private S3 bucket + CloudFront distribution (origin access control, CloudFront Function for SPA routing) |
| API | Lambda `api` (Fastify, nodejs22.x, function URL) reached through CloudFront at `/api/*` |
| Jobs | SQS queue + dead-letter queue, Lambda `worker` (event source mapping, batch size 1) |
| Retention | EventBridge Scheduler `cron(30 2 * * ? *)` UTC -> Lambda `scheduled` |
| Storage | Private S3 uploads bucket (SSE-S3, CORS for the web origin, lifecycle rules) |
| Database | `external` (default): any Postgres over TLS, via an SSM parameter you create. `aurora_serverless_v2`: Aurora PostgreSQL that scales to 0 ACU |
| Secrets | SSM Parameter Store SecureString parameters under `/<project>/<env>/` (free standard tier) |
| Email | SES domain identity + DKIM (optional if the domain is already verified) |
| TLS / DNS | ACM certificate in us-east-1 (supplied or requested), optional Route 53 records in an existing zone |
| CI/CD | GitHub OIDC provider + deploy role (S3 sync, CloudFront invalidation, `lambda:UpdateFunctionCode`) |

```
browser ──HTTPS──> CloudFront ──/*──────> S3 (web bucket)
                      │
                      └─/api/*─HTTPS──> Lambda function URL (api) ──> PostgreSQL (external or Aurora Serverless v2, TLS)
                                            │  X-Origin-Verify checked
                                            ├──> SQS jobs queue ──> Lambda (worker) ──> Amazon Transcribe, OpenRouter, SES
                                            ├──> S3 (uploads)  <── browser (presigned PUT)
                                            └──> Amazon SES (invitations)
          EventBridge Scheduler ──nightly──> Lambda (scheduled) ──> retention sweep (S3 + database)
```

**One hostname for everything.** CloudFront serves the SPA from S3 and proxies
`/api/*` to the API function URL, so the browser and the API share
`https://<domain_name>`. Auth cookies are same-site and no CORS is needed between
them. CloudFront adds a secret `X-Origin-Verify` header to every request it sends
to the function URL; the API answers `403` to anything without it, so the public
function URL cannot be used to bypass CloudFront. The function URL uses auth type
`NONE` on purpose: Lambda OAC/IAM auth would force browsers to send
`x-amz-content-sha256` on requests with a body, which the SPA does not do.

## What it costs

Every component is pay-per-use. For a small college deployment the AWS bill is
dominated by *usage* (Transcribe minutes, OpenRouter tokens billed outside AWS),
not by hosting. Put real numbers into the [AWS Pricing Calculator](https://calculator.aws/)
for `eu-west-2`; the shape of the bill is:

| Component | Charge model | Expected monthly |
| --- | --- | --- |
| Lambda (3 functions) | 1 M requests + 400,000 GB-s always free, then USD 0.20/M requests + USD 0.0000133/GB-s (arm64) | USD 0 to a few cents |
| Lambda function URL | free | USD 0 |
| CloudFront | 1 TB out, 10 M requests, 2 M function invocations always free | USD 0 |
| S3 (web + uploads) | USD 0.024/GB-month + requests | cents (recordings are deleted after `recording_retention_days`) |
| SQS | 1 M requests always free, then USD 0.40/M | USD 0 to cents (Lambda's polling counts as requests) |
| EventBridge Scheduler | 14 M invocations free | USD 0 |
| SSM Parameter Store (standard) | free | USD 0 |
| ACM certificate | free | USD 0 |
| CloudWatch Logs | 5 GB ingested free, then USD 0.57/GB; 14-day retention | USD 0 to cents |
| SES | USD 0.10 per 1,000 emails | cents |
| Route 53 | USD 0.40/M queries **if** you point an existing zone here; no zone is created | cents |
| Amazon Transcribe | USD 0.024 per audio minute (usage) | depends on meetings processed |
| Aurora Serverless v2 (optional) | USD 0 compute while paused; about USD 0.14/ACU-hour while active (min 0.5 ACU); storage about USD 0.11/GB-month; I/O USD 0.22/M | cents if used sparingly; **about USD 12 per 170 active hours** - the one item that can turn cents into pounds |
| External Postgres (default) | provider's free tier, e.g. a managed Postgres with a London region | USD 0 |

Idle, the stack costs well under a dollar a month. Keep `database_mode = "external"`
with a free-tier provider if the budget really is cents; choose Aurora when you
want everything inside the AWS account and accept paying for active hours.

## Prerequisites

- Terraform >= 1.6 and the AWS CLI v2, installed locally.
- An AWS account and an IAM identity with administrator access for the initial
  apply (`aws sts get-caller-identity` should work).
- Control of the DNS for your domain - either an existing Route 53 hosted zone
  or the ability to add records at your DNS provider.
- A PostgreSQL database reachable over TLS (default mode), or nothing (Aurora mode).
- A GitHub repository containing this code.
- Optional: Node 22 + pnpm to build the Lambda bundle locally. Not required -
  the deploy workflow builds it, and Terraform uploads a placeholder until then.

## Bootstrap order

### 1. Configure variables

```bash
cd infra/terraform-serverless
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars
```

Every variable is documented in `variables.tf`. The minimum you must change:
`domain_name`, `github_repository`, `email_from`. Decide `database_mode`,
`route53_zone_id` (or `""`) and whether to supply `acm_certificate_arn_us_east_1`.

If the container stack (`../terraform`) is deployed in the same account, give this
stack a different `environment` (e.g. `prod-sls`) - names, SSM paths and IAM roles
include it - and set `create_github_oidc_provider = false` and
`create_ses_domain_identity = false`, because both already exist.

### 2. Database (external mode): create the `DATABASE_URL` parameter

Terraform **reads** `/<project_name>/<environment>/DATABASE_URL` and fails with
`ParameterNotFound` if it does not exist, so create it first. Any PostgreSQL 14+
reachable over TLS works; a managed provider with a free tier and a London
(`eu-west-2`) region keeps data in the UK at no cost. Use the provider's
**pooled** connection string for the functions (Lambda opens many short-lived
connections) and keep the **direct** string for migrations (step 6).

```bash
aws ssm put-parameter --region eu-west-2 \
  --name /meeting-review/prod/DATABASE_URL \
  --type SecureString \
  --value 'postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require' \
  --overwrite
```

Match `/meeting-review/prod` to your `project_name`/`environment`. The provider's
certificate is normally signed by a public CA, so `sslmode=require` (which the
bundled `pg` driver treats as `verify-full`) works. Re-run `terraform apply`
after changing the value - the functions receive it as an environment variable.

In **Aurora mode** skip this step; `database.tf` creates the parameter with the
generated connection string.

### 3. Certificate and DNS

- **Have a Route 53 zone?** Set `route53_zone_id`. Terraform requests the
  certificate, adds the validation CNAME, waits for issuance, and creates the
  `A`/`AAAA` alias records and the SES records. Nothing else to do.
- **DNS elsewhere, certificate already issued in us-east-1?** Set
  `acm_certificate_arn_us_east_1`, leave `route53_zone_id = ""`, and after the
  apply create the records from the outputs `dns_records_to_create` and
  `ses_dns_records`.
- **DNS elsewhere, no certificate yet?** Leave both empty and apply in two steps,
  because CloudFront refuses a certificate that is not yet issued:

  ```bash
  terraform init
  terraform apply -target=aws_acm_certificate.cloudfront
  # The CNAME to add at your DNS provider (also in `terraform output acm_validation_record` once the full apply has run):
  CERT_ARN=$(aws acm list-certificates --region us-east-1 \
    --query "CertificateSummaryList[?DomainName=='meetingreview.example.ac.uk'].CertificateArn" --output text)
  aws acm describe-certificate --region us-east-1 --certificate-arn "$CERT_ARN" \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
  aws acm wait certificate-validated --region us-east-1 --certificate-arn "$CERT_ARN"   # polls until issued
  terraform apply                            # everything else
  ```

### 4. (Optional but recommended) remote state

The state contains the generated secrets and, in Aurora mode, the database
password. Create a private S3 bucket (versioning on, public access blocked),
uncomment the `backend "s3"` block in `versions.tf` and fill in the names. Local
state is fine for a first trial; migrate later with `terraform init -migrate-state`.

### 5. Apply

```bash
terraform init
terraform plan -out plan.tfplan
terraform apply plan.tfplan
```

The first apply takes 5-10 minutes (CloudFront is slow; Aurora adds about 10
more). If `apps/api/lambda-dist.zip` is not present, a placeholder bundle is
uploaded and `https://<domain_name>/api/health` returns `503` until step 7.

Keep the outputs handy: `terraform output` (and `terraform output github_variables`).

### 6. Paste the OpenRouter API key

Terraform creates `/<project>/<env>/OPENROUTER_API_KEY` with the placeholder
`REPLACE_ME` and never touches its value again (`ignore_changes`). Set the real
key, then apply again so the functions pick it up:

```bash
aws ssm put-parameter --region eu-west-2 \
  --name /meeting-review/prod/OPENROUTER_API_KEY \
  --type SecureString --value 'sk-or-v1-...' --overwrite
terraform apply
```

(The console route: Systems Manager -> Parameter Store -> the parameter -> *Edit*.)

### 7. First deployment, migrations and seed (GitHub Actions)

The Prisma CLI is not part of the Lambda bundle, so schema migrations and the
one-off seed run **inside the deploy workflow**, which talks to the database
directly. Configure GitHub -> Settings -> Secrets and variables -> Actions:

- **Secrets**
  - `AWS_DEPLOY_ROLE_ARN` = output `github_deploy_role_arn`
  - `DATABASE_URL` = the database connection string (the *direct*, non-pooled
    URL if your provider distinguishes them). In Aurora mode read it with
    `aws ssm get-parameter --with-decryption --name /meeting-review/prod/DATABASE_URL --query Parameter.Value --output text`.
  - `SEED_ADMIN_PASSWORD` = initial password of the first administrator (change it after the first login)
- **Variables** = every key/value from output `github_variables`
  (`AWS_REGION`, `WEB_BUCKET_NAME`, `CLOUDFRONT_DISTRIBUTION_ID`,
  `LAMBDA_API_FUNCTION`, `LAMBDA_WORKER_FUNCTION`, `LAMBDA_SCHEDULED_FUNCTION`,
  `VITE_API_BASE_URL=/api`), plus `SEED_ADMIN_EMAIL`, and optionally
  `VITE_APP_NAME`, `VITE_COLLEGE_NAME`, `VITE_LOGO_URL`, `SEED_DEMO_DATA`.

Then run the serverless deploy workflow (Actions tab -> *Run workflow*). It:

1. `pnpm install --frozen-lockfile`
2. `DATABASE_URL=... pnpm --filter @slc/api db:migrate` (Prisma `migrate deploy`)
3. First run only (manual input or a `SEED` flag): `pnpm --filter @slc/api db:seed`
   with `DATABASE_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_DEMO_DATA`
4. `pnpm --filter @slc/api build:lambda`, zips `apps/api/lambda-dist/` and runs
   `aws lambda update-function-code --function-name <each function> --zip-file fileb://lambda-dist.zip`
   followed by `aws lambda wait function-updated`
5. `pnpm --filter @slc/web build` with `VITE_API_BASE_URL=/api` (and the other
   `VITE_*` variables), `aws s3 sync` to the web bucket (hashed `assets/` with a
   one-year cache, `index.html` with `no-cache`) and a CloudFront invalidation of `/*`.

The same steps by hand, if you ever need them:

```bash
pnpm install --frozen-lockfile
DATABASE_URL='postgresql://...' pnpm --filter @slc/api db:migrate
DATABASE_URL='postgresql://...' SEED_ADMIN_EMAIL=it.admin@example.ac.uk SEED_ADMIN_PASSWORD='...' SEED_DEMO_DATA=false \
  pnpm --filter @slc/api db:seed
pnpm --filter @slc/api build:lambda
(cd apps/api/lambda-dist && zip -qr ../lambda-dist.zip .)
for fn in $(terraform -chdir=infra/terraform-serverless output -json lambda_function_names | jq -r '.[]'); do
  aws lambda update-function-code --region eu-west-2 --function-name "$fn" --zip-file fileb://apps/api/lambda-dist.zip
  aws lambda wait function-updated --region eu-west-2 --function-name "$fn"
done
VITE_API_BASE_URL=/api pnpm --filter @slc/web build
aws s3 sync apps/web/dist "s3://$(terraform -chdir=infra/terraform-serverless output -raw web_bucket_name)" --delete
aws cloudfront create-invalidation --distribution-id "$(terraform -chdir=infra/terraform-serverless output -raw cloudfront_distribution_id)" --paths '/*'
```

Check `https://<domain_name>/api/health`, then open `https://<domain_name>` and
log in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Change the password.

### 8. SES

- If `route53_zone_id` was set, the verification and DKIM records already exist
  and the domain verifies within a few minutes. Otherwise add the records from
  `terraform output ses_dns_records`.
- New accounts are in the **SES sandbox**: mail is only delivered to verified
  addresses. Request production access in the SES console before go-live.

## Day-to-day operations

| Task | How |
| --- | --- |
| Deploy a new API or web version | Merge to `main` or run the serverless deploy workflow manually. Terraform ignores function code changes, so a later `terraform apply` never rolls a deployment back |
| Change an environment variable | Edit `lambda_environment` in `lambda.tf` (or the variable behind it), `terraform apply`. Lambda picks the new configuration up on the next invocation - no redeploy needed |
| Rotate `OPENROUTER_API_KEY` | `aws ssm put-parameter --name /meeting-review/prod/OPENROUTER_API_KEY --type SecureString --value 'sk-or-v1-...' --overwrite`, then `terraform apply` (the data source re-reads the parameter and updates the three functions) |
| Rotate `JWT_SECRET` / `COOKIE_SECRET` | `terraform apply -replace=random_password.jwt_secret` (all sessions are logged out) |
| Rotate the CloudFront origin secret | `terraform apply -replace=random_password.origin_verify` (updates CloudFront and the functions together) |
| Change the external database | `put-parameter --overwrite` on `.../DATABASE_URL`, update the GitHub secret, `terraform apply` |
| Read the logs | CloudWatch Logs -> `/aws/lambda/meeting-review-prod-api` (and `-worker`, `-scheduled`), or `aws logs tail /aws/lambda/meeting-review-prod-api --follow` |
| Inspect failed jobs | SQS console -> `meeting-review-prod-jobs-dlq` -> *Start DLQ redrive* after fixing the cause |
| Run the retention sweep now | `aws lambda invoke --function-name meeting-review-prod-scheduled --cli-binary-format raw-in-base64-out --payload '{}' /dev/stdout` |
| Database access (Aurora) | `psql "$(aws ssm get-parameter --with-decryption --name /meeting-review/prod/DATABASE_URL --query Parameter.Value --output text)"` from any machine in `aurora_allowed_cidrs`, or the RDS *Query editor* (Data API is enabled) |
| Database access (external) | Your provider's console / `psql` with the same connection string |

## Database notes

### External mode (default)

- The connection string is the only thing Terraform knows about the database.
  Back-ups, maintenance and TLS are the provider's responsibility - check they
  meet your data-protection requirements (UK/EU region, encryption at rest).
- Lambda can run many instances at once; use the provider's connection pooler
  and, if your account allows it, cap concurrency with `api_reserved_concurrency`
  and `worker_max_concurrency`.

### Aurora Serverless v2 mode

- **Public endpoint, stated plainly.** The functions run outside any VPC so that
  no NAT gateway (about USD 32/month before traffic) or interface endpoints are
  needed. The cluster therefore has a public endpoint, reachable on port 5432
  from `aurora_allowed_cidrs` (default anywhere, because Lambda's egress
  addresses are not predictable). What protects it: TLS enforced server-side
  (`rds.force_ssl = 1`, plain-text connections are refused), a 32-character
  random password stored only in SSM and Terraform state, encrypted storage,
  7-day backups and deletion protection. The endpoint is discoverable but not
  usable without the password. If that does not fit your DPIA, use external
  mode with a provider offering private networking, or the container stack.
- **Scale to zero.** `aurora_min_capacity = 0` with
  `aurora_seconds_until_auto_pause = 300` pauses the cluster after five idle
  minutes; the next request waits roughly 15 seconds while it resumes (the API
  timeout of 60 s covers it). Scale-to-zero needs Aurora PostgreSQL 13.15+,
  14.12+, 15.7+, 16.3+ or 17.x; `aurora_engine_version` defaults to `16.8` - check
  it is offered in your region with
  `aws rds describe-db-engine-versions --engine aurora-postgresql --query 'DBEngineVersions[].EngineVersion' --region eu-west-2`.
- **TLS verification.** The bundled `pg` driver treats `sslmode=require` as
  `verify-full`, and the Amazon RDS certificate authority is not in Node's trust
  store, so the generated URL uses `sslmode=no-verify` (encrypted, certificate
  not checked). To verify the certificate, add the RDS CA bundle
  (`https://truststore.pki.rds.amazonaws.com/eu-west-2/eu-west-2-bundle.pem`) to
  the Lambda bundle in `apps/api/scripts/build-lambda.mjs` and set
  `aurora_db_connection_options = "sslmode=verify-full&sslrootcert=/var/task/rds-ca.pem"`.
- Switching `database_mode` later moves the `DATABASE_URL` parameter between
  "created by you" and "created by Terraform". Delete the hand-made parameter
  before switching to Aurora; export your data first in either direction.

## Security notes

- Secrets are passed to the functions as **Lambda environment variables**
  (encrypted at rest by Lambda, visible to anyone with
  `lambda:GetFunctionConfiguration` on the functions). This is what makes the
  stack need no runtime secret fetching and no KMS key of its own. Keep IAM
  access to the Lambda functions as tight as to the SSM parameters.
- Terraform state contains the same secrets. Use the S3 backend with a private
  bucket and restrict who can read it.
- The API function URL is public by design; the API answers `403` to requests
  without the `X-Origin-Verify` header that only CloudFront knows.
- No WAF is attached (AWS WAF costs about USD 5/month per web ACL). The API has
  its own rate limiting; add WAF later if abuse becomes a problem.

## Tear down

1. Export anything you need (database dump, S3 objects).
2. Aurora mode only: set `aurora_deletion_protection = false` in `terraform.tfvars`
   and `terraform apply`.
3. Empty the two S3 buckets (Terraform refuses to delete non-empty buckets):
   `aws s3 rm s3://<uploads-bucket> --recursive` and the same for the web bucket
   (names from `terraform output`).
4. `terraform destroy`. In Aurora mode a final snapshot named
   `meeting-review-prod-db-final` is taken; delete it manually once you are sure.
5. External mode: the hand-made `DATABASE_URL` parameter is not managed by
   Terraform - delete it yourself
   (`aws ssm delete-parameter --name /meeting-review/prod/DATABASE_URL`) and
   decommission the database at your provider.
6. If you let Terraform request the certificate it is deleted with the stack;
   a supplied certificate is left alone.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `terraform plan`: `ParameterNotFound` for `.../DATABASE_URL` | External mode and the parameter does not exist yet (step 2), or `project_name`/`environment` differ from the path you created |
| `https://<domain>/api/health` returns 503 `NOT_DEPLOYED` | The placeholder bundle is still deployed - run the deploy workflow (step 7) |
| `https://<domain>/api/...` returns 403 "Direct access to the API origin is not allowed" | The request did not come through CloudFront (you hit the function URL directly), or `ORIGIN_VERIFY_SECRET` was rotated without `terraform apply` finishing |
| API errors `self-signed certificate in certificate chain` | Aurora with `sslmode=require`: use `sslmode=no-verify` or ship the RDS CA bundle (see Database notes) |
| First request after a quiet period takes 15-20 s | Aurora resuming from 0 ACU (expected), plus a Lambda cold start |
| CloudFront returns 504 on long requests | The API function hit the 60 s limit CloudFront allows for an origin; move the work to a background job |
| `terraform apply` fails: certificate "doesn't exist / isn't valid" | The requested certificate is not issued yet - add the validation CNAME (`terraform output acm_validation_record`) and wait, see step 3 |
| `terraform apply` fails: OIDC provider already exists | Set `create_github_oidc_provider = false` |
| `terraform apply` fails: SES identity already exists | Set `create_ses_domain_identity = false` |
| Deploy workflow: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Workflow is running on a branch other than `github_deploy_branch`, or `github_repository` is wrong |
| Jobs pile up in the DLQ | Open a message in the SQS console, read the worker log group for the `messageId`, fix the cause (often the OpenRouter key or Transcribe permissions), then redrive |
| Browser upload fails with a CORS error | The S3 CORS rule allows exactly `https://<domain_name>` - open the site on that hostname (no `www.`) |
| Emails not delivered | SES sandbox (verify recipients or request production access) or the domain is not verified yet (check SES -> Identities) |
