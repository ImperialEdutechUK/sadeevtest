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
