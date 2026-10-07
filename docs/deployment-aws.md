# Deploying Meeting Review on AWS

This guide walks an IT team through deploying Meeting Review into a single AWS
account in the London region (`eu-west-2`), so that all data stays in the UK.
It assumes you are comfortable with a terminal and basic networking, but not
that you are an AWS specialist. Everything is created by Terraform from
`infra/terraform`; nothing needs to be clicked together by hand except
certificates, the OpenRouter key and a few GitHub settings.

## 1. Architecture at a glance

```
            ┌──────────────────────────── https://meetingreview.example.ac.uk ───────────────────────────┐
            │                                                                                            │
 Browser ───┤ CloudFront (CDN, TLS)                                                                      │
            │   ├── /*       ──> S3 "web" bucket   (React SPA, static files)                             │
            │   └── /api/*   ──> ALB (HTTPS) ──> ECS Fargate "api" task(s) ──> RDS PostgreSQL 16         │
            │                                         │                                                  │
            │                                         ├──> S3 "uploads" bucket  <── browser (presigned PUT)
            │                                         ├──> Amazon Transcribe   (speech to text)          │
            │                                         ├──> Amazon SES          (notification email)      │
            │                                         └──> OpenRouter          (LLM analysis, internet)  │
            └────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Component | AWS service | Notes |
| --- | --- | --- |
| Web app | S3 + CloudFront | Static files, private bucket, served only through CloudFront |
| API + background worker | ECS Fargate behind an Application Load Balancer | One Docker image (`apps/api/Dockerfile`); runs DB migrations on start |
| Database | RDS PostgreSQL 16 | Private subnets, encrypted, 7-day automated backups, deletion protection |
| Recordings and documents | S3 "uploads" bucket | Browser uploads directly via presigned URLs; objects expire after `recording_retention_days` |
| Transcription | Amazon Transcribe | Reads media from, and writes JSON to, the uploads bucket |
| Email | Amazon SES | Domain identity + DKIM created by Terraform |
| AI analysis | OpenRouter | External API; key stored in Secrets Manager |
| Secrets | AWS Secrets Manager | Database URL, JWT/cookie secrets, OpenRouter key, first admin password |
| Deployments | GitHub Actions + OIDC | No long-lived AWS keys in GitHub |

**Same origin for web and API.** The SPA calls `/api/...` on its own hostname.
CloudFront forwards those requests to the ALB, adding a secret
`X-Origin-Verify` header; the ALB only accepts requests that carry it. This keeps
authentication cookies same-site, removes the need for CORS between web and API,
and means the API is not reachable except through CloudFront. Optionally a
second hostname (`api_domain_name`) can expose the API directly.

## 2. Prerequisites

- An AWS account with billing enabled and an IAM user/role with administrator
  rights for the initial setup. Enable MFA on it.
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.6 and the
  [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
  on the machine you deploy from, with credentials configured
  (`aws configure sso` or access keys; check with `aws sts get-caller-identity`).
- A hostname for the application, e.g. `meetingreview.example.ac.uk`, and the
  ability to create DNS records for it (a Route 53 hosted zone is easiest, but
  any DNS provider works).
- A sending domain for email (usually the same domain) - you will need to add
  DNS records for SES.
- An [OpenRouter](https://openrouter.ai/) account and API key.
- A GitHub repository containing this code, with permission to add secrets,
  variables and run workflows.

## 3. Domain and certificates

Two TLS certificates are needed in AWS Certificate Manager (ACM); both are free.

| Certificate | Region | Must cover | Used by |
| --- | --- | --- | --- |
| 1 | **us-east-1** (N. Virginia) | `meetingreview.example.ac.uk` | CloudFront (only accepts us-east-1 certificates) |
| 2 | **eu-west-2** (London) | `meetingreview.example.ac.uk` and, if you want direct API access, `api.meetingreview.example.ac.uk` | The load balancer |

The web hostname has to be on certificate 2 as well, because CloudFront passes
the browser's `Host` header to the load balancer and checks the load balancer's
certificate against it.

1. ACM console -> switch region -> *Request certificate* -> *Public* -> enter
   the name(s) -> *DNS validation*.
2. Create the validation CNAME records it shows (with Route 53 there is a
   *Create records in Route 53* button). Wait for status **Issued** (minutes).
3. Note both ARNs.

If your DNS is not in Route 53 you will later also create:
`meetingreview.example.ac.uk CNAME <cloudfront domain>` (Terraform prints it)
and the SES records.

## 4. Terraform apply

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars`: `domain_name`, both certificate ARNs,
`route53_zone_id` (or `""`), `github_repository` (`owner/repo`), `email_from`,
`seed_admin_email`. The rest can stay on defaults for a first deployment.

```bash
terraform init
terraform plan -out plan.tfplan     # review what will be created
terraform apply plan.tfplan         # 10-20 minutes
terraform output                    # keep this handy
```

The ECS service will report failing tasks until an image has been pushed - this
is expected, continue with the next steps. See `infra/terraform/README.md` for
remote state, variables and tear-down.

## 5. Secrets

Terraform generated the database password, JWT and cookie secrets and the first
administrator's password. One secret needs your input - the OpenRouter key:

```bash
aws secretsmanager put-secret-value --region eu-west-2 \
  --secret-id meeting-review-prod/openrouter-api-key \
  --secret-string 'sk-or-v1-...'
```

(Or: Secrets Manager console -> `meeting-review-prod/openrouter-api-key` ->
*Retrieve secret value* -> *Edit*.) Terraform never overwrites this value.

## 6. GitHub configuration

GitHub -> repository -> *Settings* -> *Secrets and variables* -> *Actions*.

**Secret**

| Name | Value |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |

**Variables** - `terraform output github_variables` prints all of them:

| Name | Purpose |
| --- | --- |
| `WEB_BUCKET_NAME` | S3 bucket the web build is uploaded to |
| `CLOUDFRONT_DISTRIBUTION_ID` | Cache invalidation after a web deploy |
| `ECR_REPOSITORY`, `ECS_CLUSTER`, `ECS_SERVICE`, `ECS_TASK_FAMILY` | API deployment targets (defaults in the workflow match the Terraform defaults) |
| `AWS_REGION` | `eu-west-2` |
| `VITE_API_BASE_URL` | `/api` (same-origin). Only set a full URL if the API is on another hostname |
| `VITE_APP_NAME`, `VITE_COLLEGE_NAME` | Optional branding, default "Meeting Review" / "South London College" |

The deploy role only trusts workflow runs from the `main` branch of the named
repository (`github_deploy_branch` in Terraform).

## 7. First deployment

1. *Actions* -> **Deploy API** -> *Run workflow* (branch `main`). This builds
   the image, pushes it to ECR, registers a task definition and waits for the
   service to become healthy. The API applies the Prisma migrations itself on
   start-up (`RUN_MIGRATIONS_ON_START=true`).
2. *Actions* -> **Deploy Web** -> *Run workflow*. Builds the SPA with
   `VITE_API_BASE_URL=/api`, uploads it to S3 and invalidates CloudFront.
3. DNS: if `route53_zone_id` was set, records already exist. Otherwise create
   the records from `terraform output dns_records_to_create` and
   `terraform output ses_dns_records`.

Afterwards every merge to `main` that touches `apps/api/**` or `apps/web/**`
(or `packages/shared/**`) deploys automatically. `CI` runs on every pull request.

## 8. Seeding the first administrator

Run the seed script once as a one-off ECS task using the same image, roles and
secrets as the service. `terraform output -raw seed_task_command` prints the
exact command; it looks like this:

```bash
aws ecs run-task \
  --region eu-west-2 \
  --cluster meeting-review-prod \
  --launch-type FARGATE \
  --task-definition meeting-review-prod-api \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-aaa,subnet-bbb],securityGroups=[sg-ccc],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["node","dist/seed/seed.js"]}]}'
```

Follow it in the ECS console (*Clusters* -> *meeting-review-prod* -> *Tasks*)
or in CloudWatch Logs (`/ecs/meeting-review-prod/api`). It creates the user in
`seed_admin_email` with the password stored in Secrets Manager:

```bash
aws secretsmanager get-secret-value --region eu-west-2 \
  --secret-id meeting-review-prod/seed-admin-password \
  --query SecretString --output text
```

Sign in and change it immediately. `seed_demo_data = true` in `terraform.tfvars`
would also create demo tutors, meetings and reports (useful for evaluation, not
for a live system).

## 9. Verifying the deployment

| Check | Expected |
| --- | --- |
| `curl -s https://meetingreview.example.ac.uk/api/health` | HTTP 200 with a JSON status |
| Open `https://meetingreview.example.ac.uk` | Login page loads; browser dev tools show `/api/...` calls on the same hostname |
| Sign in with the seeded admin | Works; the cookie is set for the web domain |
| Upload a short recording | Progress completes (direct-to-S3), status moves to transcribing/analysing |
| ECS console -> service | 1 running task, deployment *Completed*, target *healthy* in the target group |
| SES console -> Identities | Domain status *Verified*; DKIM *Successful* |
| `curl -sI https://<alb-dns-name>/api/health` | 403 - the ALB rejects traffic that did not come through CloudFront |

## 10. Updating the application

- **Code changes**: merge to `main`. The workflows deploy only what changed.
  Both can also be started by hand from the *Actions* tab.
- **Configuration changes** (environment variables, CPU/memory, retention):
  edit `terraform.tfvars` or `infra/terraform/ecs.tf`, `terraform apply`, then
  run **Deploy API** so the new task definition is rolled out (Terraform
  deliberately leaves roll-outs to the workflow).
- **Secrets**: update in Secrets Manager, then run **Deploy API** (containers
  read secrets at start).
- **Rollback**: ECS automatically rolls back a deployment whose tasks never
  become healthy. To roll back a bad-but-healthy release, re-run **Deploy API**
  from the previous commit (*Run workflow* -> choose the commit/branch), or
  update the service to an older task definition revision in the console.
- **Postgres / Node upgrades**: RDS applies minor versions in the maintenance
  window; major versions are a deliberate change of `db_engine_version`.

## 11. Backups and data retention

| Data | Where | Protection |
| --- | --- | --- |
| Database | RDS | Automated daily backups, 7 days retention, point-in-time recovery; final snapshot on deletion; deletion protection on. Take a manual snapshot before major changes: `aws rds create-db-snapshot --db-instance-identifier meeting-review-prod-db --db-snapshot-identifier before-upgrade-YYYYMMDD` |
| Recordings and documents | S3 uploads bucket | Encrypted at rest; deleted automatically after `recording_retention_days` (default 90) under `recordings/`; Transcribe output after 30 days. Versioning is off so a delete is final - lengthen retention rather than relying on undelete |
| Web build | S3 web bucket | Rebuilt from git at any time |
| Secrets | Secrets Manager | Deleted secrets are recoverable for 7 days |
| Infrastructure | Terraform state | Keep state in the S3 backend (versioned) - see `infra/terraform/versions.tf` |

Set the retention period in line with the college's data protection policy and
privacy notice for recorded meetings.

## 12. Monitoring

- **Logs**: CloudWatch Logs -> `/ecs/meeting-review-prod/api` (30-day retention).
  CLI: `aws logs tail /ecs/meeting-review-prod/api --follow`.
- **Health**: ALB target group health (ECS console -> service -> *Health and
  metrics*), ECS Container Insights (CPU/memory per task), RDS *Monitoring* tab
  (connections, storage, CPU).
- **Suggested alarms** (CloudWatch -> Alarms, email via SNS): ALB
  `HTTPCode_Target_5XX_Count` > 0 for 5 minutes, `UnHealthyHostCount` >= 1,
  ECS service `RunningTaskCount` < desired, RDS `FreeStorageSpace` low and
  `CPUUtilization` high. These are not created by Terraform to keep the module
  small; add them once you know your baseline.
- **Costs**: enable AWS Budgets with an email alert at the monthly figure you
  expect; tag-based cost allocation works out of the box because every resource
  is tagged `Project`/`Environment`.

## 13. Cost drivers

Use the AWS Pricing Calculator for actual figures in `eu-west-2`. What you pay for:

1. NAT gateway (hourly + per GB) - the biggest fixed item in a small deployment.
2. RDS instance hours, storage and backup storage (Multi-AZ doubles the instance).
3. ECS Fargate vCPU/memory hours for the API task(s).
4. Application Load Balancer hourly charge and capacity units.
5. Amazon Transcribe per audio minute - scales directly with meetings processed.
6. OpenRouter usage (billed by OpenRouter, per token).
7. S3 storage/requests, CloudFront requests/transfer, Secrets Manager per secret,
   CloudWatch logs and Container Insights, SES per email.

Levers: shorter `recording_retention_days`, a smaller RDS class, one API task,
and (if latency is acceptable) stopping non-production stacks outside working hours.

## 14. Troubleshooting

| Symptom | What to check |
| --- | --- |
| Site loads but every API call fails with 502 | CloudFront cannot validate the ALB certificate: the regional certificate must include the web hostname. Reissue and update `acm_certificate_arn_regional` |
| API calls return 403 "Forbidden" (plain text) | Request reached the ALB without the CloudFront header - you are using the ALB hostname directly. Use the web hostname or set `api_domain_name` |
| ECS tasks start and stop repeatedly | Open the stopped task -> *Logs*. Common causes: missing image (run Deploy API), database connection/TLS error (see next row), a secret still set to its placeholder |
| Log shows `self-signed certificate in certificate chain` | Node's `pg` driver is validating the RDS certificate against the system store. Options: add the RDS CA bundle to the image and set `NODE_EXTRA_CA_CERTS`, or set `db_connection_options = "sslmode=no-verify"` (encrypted, no CA check), apply, then Deploy API |
| Deploy API fails at "Configure AWS credentials" | `AWS_DEPLOY_ROLE_ARN` wrong, the workflow ran from a branch other than `main`, or `github_repository` in Terraform does not match |
| Deploy API times out waiting for stability | New tasks never became healthy; ECS rolled back. Read the task logs. `/api/health` must answer 200 within 120 s of start (migrations run first) |
| Uploads fail in the browser (CORS/network error) | The S3 CORS rule allows only `https://<domain_name>`; open the site on exactly that hostname. Check the task role has S3 permissions (Terraform) |
| Transcription stuck | CloudWatch logs for Transcribe errors; confirm `TRANSCRIPTION_PROVIDER=aws` and the uploads bucket/region match. Transcribe uses the task role's permissions to read/write the bucket |
| Analysis fails | OpenRouter key placeholder not replaced, or account out of credit; check logs for 401/402 responses |
| No emails | SES sandbox (request production access), domain not verified, or `EMAIL_FROM` domain differs from the verified one |
| `terraform apply`: OIDC provider already exists | Set `create_github_oidc_provider = false` |
| `terraform destroy` fails on the database | Set `deletion_protection = false` in `database.tf`, apply, then destroy |

## 15. Deploying elsewhere

Nothing in the application is tied to AWS beyond optional integrations:

- **API**: a standard Docker image (`apps/api/Dockerfile`, Node 22) that needs a
  PostgreSQL database and the environment variables in `apps/api/.env.example`.
  It runs on any container host (another cloud, a college VM with Docker, a
  Kubernetes cluster). Storage can be local disk (`STORAGE_PROVIDER=local`) or
  any S3-compatible service (`S3_ENDPOINT`, e.g. MinIO); transcription and email
  can be switched to `mock`/`none` if the AWS services are not available.
- **Web**: the output of `pnpm --filter @slc/web build` is a folder of static
  files. Serve it from any web server or CDN; configure it to return
  `index.html` for unknown paths (SPA routing) and set `VITE_API_BASE_URL` at
  build time to wherever the API lives (`/api` if the same host proxies it).
- `infra/docker-compose.yml` shows the whole stack running on a single machine
  with Postgres and MinIO and is a reasonable starting point for an on-premises
  deployment.

## 16. Pay-per-request profile (cents per month)

Sections 1-14 describe the **container profile** (`infra/terraform`): an
always-on ECS service behind a load balancer, with RDS in private subnets and a
NAT gateway. That design is robust but its fixed cost is tens of pounds a month
before a single meeting is processed, because the NAT gateway, load balancer,
RDS instance and Fargate task are billed per hour whether or not anyone uses
the system.

The **pay-per-request profile** in
[`infra/terraform-serverless`](../infra/terraform-serverless/README.md) deploys
the same application with no always-on infrastructure at all. Every service it
uses is billed per request (Lambda, SQS, CloudFront, S3, Transcribe) or sits
inside a permanent free tier (SSM Parameter Store, EventBridge Scheduler,
CloudWatch Logs basics), so an idle deployment costs **cents per month** and a
busy one costs what it actually uses. The full line-by-line breakdown, with
the free-tier allowances and what happens when they are exceeded, is in
[`docs/hosting-costs.md`](hosting-costs.md).

```
            ┌──────────────────────────── https://meetingreview.example.ac.uk ───────────────────────────┐
            │                                                                                            │
 Browser ───┤ CloudFront (CDN, TLS)                                                                      │
            │   ├── /*       ──> S3 "web" bucket   (React SPA, static files)                             │
            │   └── /api/*   ──> Lambda "api" (function URL, X-Origin-Verify) ──> PostgreSQL            │
            │                        │                                             (external managed DB │
            │                        ├──> SQS job queue ──> Lambda "worker" ──┐    or Aurora Serverless │
            │                        │                        │               │    v2 scaling to zero)  │
            │   EventBridge Scheduler (02:30 UTC) ──> Lambda "scheduled" ─────┤                         │
            │                                                                 ├──> S3 "uploads" bucket  │
            │                                                                 ├──> Amazon Transcribe    │
            │                                                                 ├──> Amazon SES           │
            │                                                                 └──> OpenRouter           │
            └────────────────────────────────────────────────────────────────────────────────────────────┘
```

What changes compared with the container profile:

| Area | Container profile (`infra/terraform`) | Pay-per-request profile (`infra/terraform-serverless`) |
| --- | --- | --- |
| API | ECS Fargate task behind an ALB | Lambda function (`api.handler`, Node 22) with a function URL that only CloudFront calls; CloudFront adds `X-Origin-Verify`, the API answers 403 without it |
| Background jobs | pg-boss inside the API process | SQS queue + dead-letter queue -> Lambda `worker.handler`; nightly retention sweep via EventBridge Scheduler -> Lambda `scheduled.handler` |
| Database | RDS PostgreSQL in private subnets | `database_mode = "external"`: a managed Postgres you supply (e.g. a free-tier provider in London) reachable over TLS. `database_mode = "aurora_serverless_v2"`: Aurora PostgreSQL Serverless v2 scaling to **0 ACU** when idle, public endpoint protected by TLS (`rds.force_ssl=1`) and a long random password |
| Network | VPC, NAT gateway, private subnets | None for the Lambdas (they run outside a VPC, so no NAT). Aurora mode adds a VPC with public subnets only |
| Secrets | Secrets Manager (per-secret monthly fee) | SSM Parameter Store SecureString parameters under `/meeting-review/<env>/` (standard parameters are free) |
| Migrations and seed | Run by the container on start / one-off ECS task | Run by the deploy workflow from GitHub Actions against the `DATABASE_URL` secret (the Prisma CLI is not bundled into Lambda) |
| Logs | CloudWatch, 30-day retention | CloudWatch, 14-day retention |
| Certificates | Two (us-east-1 for CloudFront, eu-west-2 for the ALB) | One (us-east-1 for CloudFront); the function URL uses an AWS-managed certificate |
| Deploy | `Deploy API` + `Deploy Web` | One workflow, `Deploy (serverless)` |

### Which profile to choose

| Choose the **container profile** when ... | Choose the **pay-per-request profile** when ... |
| --- | --- |
| Predictable latency matters: no cold starts, the database is always warm | Cost is the deciding factor: a pilot, an evaluation, a small college or bursty use (busy a few hours a week) |
| The database must not have an internet-facing endpoint (private subnets only) | A managed Postgres provider is acceptable, or a public Aurora endpoint protected by TLS and a long random password is acceptable (and the ~GBP 30+/month a NAT gateway would cost is not) |
| The team already runs ECS and has a budget for a fixed monthly spend | Occasional cold starts are fine: roughly 1-3 s for the first API request after a quiet period, plus about 15 s if an Aurora cluster has to resume from 0 ACU (external databases with their own idle/resume behaviour are similar) |
| Jobs may need to run for more than 15 minutes in one go | Each job finishes well inside Lambda's 15-minute limit. The application already fits: transcription is asynchronous (the worker starts an Amazon Transcribe job and re-queues a check every 30-60 s instead of waiting) and LLM calls time out after 3 minutes |

Both profiles run exactly the same code and environment contract
(`apps/api/.env.example`), so you can start on the pay-per-request profile and
move to the container profile later: deploy the other stack, copy the database
(`pg_dump` / `pg_restore`) and the uploads bucket, then switch DNS. Request and
response bodies through the API are limited to 6 MB by the function URL; this
does not affect recordings or documents, which the browser uploads and
downloads directly from S3 through presigned URLs.

Trade-off to state plainly to the data-protection lead: in Aurora mode the
database has a public endpoint. It is protected by TLS (connections without it
are refused), a 32+ character random password and deletion protection, and it
scales to zero when unused. The alternative, a private database reachable only
from inside a VPC, forces the Lambdas into the VPC and therefore needs a NAT
gateway (or interface endpoints) for Transcribe, SES, SQS and OpenRouter, which
alone costs more per month than everything else in this profile combined. The
`external` mode has the same property: the managed provider's endpoint is
public and TLS-protected.

### The deploy workflow

[`.github/workflows/deploy-serverless.yml`](../.github/workflows/deploy-serverless.yml)
replaces both `Deploy API` and `Deploy Web`. It runs on every push to `main`
that touches `apps/**`, `packages/**` or `infra/terraform-serverless/**`, and by
hand from the *Actions* tab (*Run workflow*, with a `run_seed` tick box). One
run does, in order:

1. `pnpm install`, build `@slc/shared`, generate the Prisma client.
2. `prisma migrate deploy` against the `DATABASE_URL` secret, retried for about
   a minute so a database that is resuming from idle does not fail the deploy.
3. Optionally the seed (`run_seed = true`): creates the first system
   administrator from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Safe to re-run;
   existing users are left alone.
4. `pnpm --filter @slc/api build:lambda` (esbuild bundles `api.mjs`,
   `worker.mjs`, `scheduled.mjs`), zip, `aws lambda update-function-code` on
   the three functions and wait for each to report *Successful*. Terraform owns
   the functions' memory, timeout and environment; the workflow only replaces code.
5. `pnpm --filter @slc/web build` with `VITE_API_BASE_URL=/api`, sync to the web
   bucket (hashed assets cached for a year, `index.html` never cached) and a
   CloudFront invalidation.

**Disable the workflows you are not using.** `Deploy API`, `Deploy Web` and
`Deploy (serverless)` all trigger on pushes to `main`; in a repository that
uses the pay-per-request profile, disable the first two (*Actions* -> the
workflow -> "..." -> *Disable workflow*) so they do not fail looking for an ECS
cluster that does not exist, and the other way round for the container profile.

### GitHub secrets and variables for `Deploy (serverless)`

GitHub -> repository -> *Settings* -> *Secrets and variables* -> *Actions*.
`terraform output github_variables` in `infra/terraform-serverless` prints the
variable values; `terraform output -raw github_deploy_role_arn` prints the role.

**Secrets**

| Name | Value | Needed |
| --- | --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | OIDC deploy role created by Terraform (S3 sync, CloudFront invalidation and `lambda:UpdateFunctionCode` on the three functions only) | Always |
| `DATABASE_URL` | The same connection string as the SSM parameter `/meeting-review/<env>/DATABASE_URL`, used to run migrations and the seed from the runner over TLS. External mode: the URL from your Postgres provider (append `?sslmode=require` if it is not already enforced). Aurora mode: `aws ssm get-parameter --with-decryption --name /meeting-review/prod/DATABASE_URL --query Parameter.Value --output text` after the first apply | Always |
| `SEED_ADMIN_EMAIL` | E-mail address of the first system administrator | Only for `run_seed = true` |
| `SEED_ADMIN_PASSWORD` | Their initial password; change it after the first sign-in | Only for `run_seed = true` |

**Variables**

| Name | Purpose | Default |
| --- | --- | --- |
| `LAMBDA_API_NAME` | Lambda function behind `/api/*` | required |
| `LAMBDA_WORKER_NAME` | Lambda function consuming the SQS job queue | required |
| `LAMBDA_SCHEDULED_NAME` | Lambda function run nightly by EventBridge Scheduler | required |
| `WEB_BUCKET` | S3 bucket that holds the built SPA | required |
| `CLOUDFRONT_DISTRIBUTION_ID` | Distribution to invalidate after a web upload | required |
| `AWS_REGION` | Region of the stack | `eu-west-2` |
| `VITE_APP_NAME`, `VITE_COLLEGE_NAME` | Branding baked into the SPA | `Meeting Review`, `South London College` |
| `VITE_LOGO_URL` | Logo shown in the header and on the sign-in page (a file in `apps/web/public` or an absolute URL) | `/slc-logo.png` |
| `SEED_DEMO_DATA` | `true` also creates demo tutors, meetings and reports when seeding (evaluation only) | `false` |

`VITE_API_BASE_URL` is not a variable in this profile: it is always `/api`,
because CloudFront routes that path to the API Lambda, and the API rejects
requests that do not arrive through CloudFront (missing `X-Origin-Verify`).

### First deployment checklist

1. One ACM certificate in **us-east-1** for `domain_name` (section 3, certificate 1
   only; no regional certificate is needed because there is no load balancer).
2. Database. External mode (default): create a PostgreSQL database with a
   provider that offers a London region, copy its TLS connection string and
   store it before the first apply:
   `aws ssm put-parameter --region eu-west-2 --name /meeting-review/prod/DATABASE_URL --type SecureString --value 'postgresql://...?sslmode=require'`.
   Aurora mode: set `database_mode = "aurora_serverless_v2"` in
   `terraform.tfvars`; Terraform creates the cluster and the parameter.
3. `cd infra/terraform-serverless`, copy and edit `terraform.tfvars.example`
   (`domain_name`, certificate ARN, `github_repository`, `email_from`, optional
   existing `route53_zone_id`), then `terraform init && terraform apply`.
4. Paste the OpenRouter key:
   `aws ssm put-parameter --region eu-west-2 --name /meeting-review/prod/OPENROUTER_API_KEY --type SecureString --value 'sk-or-v1-...' --overwrite`,
   then run `terraform apply` again. Lambda environment variables are copied
   from the parameters at apply time, so **every parameter change needs an
   apply** to reach the functions (there is no runtime secret lookup).
5. Create the GitHub secrets and variables from the tables above.
6. *Actions* -> **Deploy (serverless)** -> *Run workflow* with `run_seed` ticked.
7. DNS: with `route53_zone_id` set the records exist already; otherwise create
   the CNAME to the CloudFront hostname and the SES records from the outputs.
8. Verify: `curl -s https://<domain>/api/health` returns 200; calling the
   API Lambda's function URL directly (printed by `terraform output`) returns
   403 for anything but `/api/health`; the SPA signs in; an uploaded recording moves
   through transcribing and analysing (the worker's CloudWatch log group shows
   the SQS messages); a message that fails three times lands in the dead-letter
   queue rather than disappearing.

### Updating and operating

- **Code**: merge to `main` or run the workflow by hand; migrations run first,
  the functions are updated in place, then the web build.
- **Configuration or secrets**: change `terraform.tfvars` or the SSM parameter,
  then `terraform apply`. A new Lambda version picks the values up on its next
  cold start; there is nothing to restart.
- **Rollback**: re-run the workflow from the previous commit (*Run workflow* ->
  pick the commit or branch); the code update is atomic per function.
- **Logs**: `aws logs tail /aws/lambda/<LAMBDA_API_NAME> --follow` (and the
  worker / scheduled groups); 14-day retention.
- **Stuck or failing jobs**: look at the dead-letter queue in the SQS console;
  the message body names the job and meeting. Fix the cause (usually a
  placeholder OpenRouter key, SES sandbox or a transcription error in the
  worker log) and redrive the messages to the main queue from the console.
- **Costs**: see [`docs/hosting-costs.md`](hosting-costs.md). The only
  usage-driven items of note are Amazon Transcribe (per audio minute),
  OpenRouter (per token, billed by OpenRouter) and, in Aurora mode, ACU-hours
  while the cluster is awake. Set an AWS Budget alert at a few pounds so a
  surprise is noticed within a day.
