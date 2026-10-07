# Meeting Review - AWS infrastructure (Terraform)

Single root module that creates everything the application needs in one AWS
account and region (default `eu-west-2`, London):

| Area | Resources |
| --- | --- |
| Network | VPC `10.20.0.0/16`, 2 public + 2 private subnets, internet gateway, 1 NAT gateway, S3 gateway endpoint |
| Web | Private S3 bucket + CloudFront distribution (origin access control) |
| API | ECR repository, ECS Fargate cluster/service, ALB (HTTPS), CloudWatch logs |
| Data | RDS PostgreSQL 16 (encrypted, 7-day backups, deletion protection), S3 uploads bucket |
| Integrations | SES domain identity + DKIM, IAM permissions for Amazon Transcribe |
| Secrets | Secrets Manager: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `OPENROUTER_API_KEY`, seed admin password |
| CI/CD | GitHub OIDC provider + deploy role for the workflows in `.github/workflows` |

**One hostname for everything.** CloudFront serves the SPA from S3 and proxies
`/api/*` to the ALB, so the browser and the API share `https://<domain_name>`.
Auth cookies are same-site and no CORS is needed. CloudFront adds a secret
`X-Origin-Verify` header to every request it sends to the ALB; the ALB listener
only forwards requests that carry it (`enforce_cloudfront_origin = true`).
Set `api_domain_name` only if you also want the API reachable directly.

```
browser ──HTTPS──> CloudFront ──/*──────> S3 (web bucket)
                      │
                      └─/api/*─HTTPS──> ALB ──> ECS Fargate (api) ──> RDS PostgreSQL
                                                     │
                                                     ├──> S3 (uploads)  <── browser (presigned PUT)
                                                     ├──> Amazon Transcribe
                                                     ├──> Amazon SES
                                                     └──> OpenRouter (internet via NAT)
```

## Prerequisites

- Terraform >= 1.6 and the AWS CLI v2, installed locally.
- An AWS account and an IAM identity with administrator access for the initial
  apply (`aws sts get-caller-identity` should work).
- Control of the DNS for your domain - either a Route 53 hosted zone (recommended)
  or the ability to add records at your DNS provider.
- A GitHub repository containing this code.

## Bootstrap order

### 1. Certificates (ACM) - before the first apply

Terraform expects two existing, **issued** certificates:

1. **us-east-1** (CloudFront only accepts certificates from this region):
   covering `domain_name` (e.g. `meetingreview.example.ac.uk`).
2. **Regional (eu-west-2)**, for the ALB: covering `domain_name` **and**, if
   you set it, `api_domain_name`. The web domain is required on this
   certificate because CloudFront forwards the browser's `Host` header to the
   ALB and validates the ALB certificate against it.

Request them in the ACM console (or CLI) with DNS validation and wait until the
status is *Issued*:

```bash
aws acm request-certificate --region us-east-1 --validation-method DNS \
  --domain-name meetingreview.example.ac.uk
aws acm request-certificate --region eu-west-2 --validation-method DNS \
  --domain-name meetingreview.example.ac.uk \
  --subject-alternative-names api.meetingreview.example.ac.uk   # omit if not using api_domain_name
```

Add the validation CNAME records ACM shows you (the console can add them to
Route 53 with one click). Copy both certificate ARNs into `terraform.tfvars`.

### 2. Configure variables

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars
```

Every variable is documented in `variables.tf`. The minimum you must change:
`domain_name`, both certificate ARNs, `route53_zone_id` (or `""`),
`github_repository`, `email_from`, `seed_admin_email`.

### 3. (Optional but recommended) remote state

Create an S3 bucket and DynamoDB lock table, uncomment the `backend "s3"` block
in `versions.tf` and fill in the names. Local state is fine for a first trial;
migrate later with `terraform init -migrate-state`.

### 4. Apply

```bash
terraform init
terraform plan -out plan.tfplan
terraform apply plan.tfplan
```

The first apply takes 10-20 minutes (RDS and CloudFront are slow to create).
It is **expected** that the ECS service shows failed tasks at this point: no API
image has been pushed yet. Step 6 fixes that.

Keep the outputs handy: `terraform output` (and `terraform output github_variables`).

### 5. Paste the OpenRouter API key into the secret

Terraform creates `meeting-review-prod/openrouter-api-key` with a placeholder
and never touches its value again (`ignore_changes`). Set the real key either
in the console (Secrets Manager -> the secret -> *Retrieve secret value* ->
*Edit* -> plaintext) or with the CLI:

```bash
aws secretsmanager put-secret-value --region eu-west-2 \
  --secret-id meeting-review-prod/openrouter-api-key \
  --secret-string 'sk-or-v1-...'
```

ECS reads secrets when a task starts, so redeploy (or force a new deployment)
after changing it.

### 6. First deployment

1. In GitHub -> Settings -> Secrets and variables -> Actions:
   - **Secret** `AWS_DEPLOY_ROLE_ARN` = output `github_deploy_role_arn`.
   - **Variables** = every key/value from output `github_variables`.
2. Run the **Deploy API** workflow (Actions tab -> *Deploy API* -> *Run workflow*).
   It builds the image, pushes it to ECR, registers a task definition revision
   and waits for the service to become stable. The container runs the Prisma
   migrations on start (`RUN_MIGRATIONS_ON_START=true`).
3. Run the **Deploy Web** workflow (or push a change under `apps/web`).
4. Check `https://<domain_name>/api/health` and then open `https://<domain_name>`.

### 7. Seed the first administrator (one-off ECS task)

`terraform output -raw seed_task_command` prints a ready-to-run command. It is:

```bash
aws ecs run-task \
  --region eu-west-2 \
  --cluster meeting-review-prod \
  --launch-type FARGATE \
  --task-definition meeting-review-prod-api \
  --network-configuration "awsvpcConfiguration={subnets=[<private-subnet-1>,<private-subnet-2>],securityGroups=[<ecs-tasks-sg>],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["node","dist/seed/seed.js"]}]}'
```

(Subnet and security group IDs come from the `private_subnet_ids` and
`ecs_tasks_security_group_id` outputs.) The task uses the same image, roles and
secrets as the service, so it needs nothing else. Watch it in the ECS console
(*Tasks* tab) or in the CloudWatch log group `/ecs/meeting-review-prod/api`.

The seed creates the admin named in `seed_admin_email` with the generated
password stored in Secrets Manager:

```bash
aws secretsmanager get-secret-value --region eu-west-2 \
  --secret-id meeting-review-prod/seed-admin-password \
  --query SecretString --output text
```

Log in with it and change it straight away.

### 8. SES

- If `route53_zone_id` was set, the verification and DKIM records already exist
  and the domain verifies within a few minutes. Otherwise add the records from
  `terraform output ses_dns_records`.
- New accounts are in the **SES sandbox**: mail is only delivered to verified
  addresses. Request production access in the SES console (*Account dashboard*
  -> *Request production access*) before go-live.

## Day-to-day operations

| Task | How |
| --- | --- |
| Deploy a new API version | Merge to `main` (paths under `apps/api` or `packages/shared`) or run *Deploy API* manually |
| Deploy the web app | Merge to `main` (paths under `apps/web`) or run *Deploy Web* manually |
| Change an environment variable | Edit `ecs.tf` (`api_environment`), `terraform apply`, **then run *Deploy API*** - Terraform registers the new revision but intentionally does not roll it out (`ignore_changes = [task_definition]`) |
| Rotate `OPENROUTER_API_KEY` | `put-secret-value` as above, then *Deploy API* or `aws ecs update-service --force-new-deployment` |
| Scale the API | Change `api_desired_count` / `api_cpu` / `api_memory` and apply, then *Deploy API* |
| Shell into a running task | `aws ecs execute-command --cluster meeting-review-prod --task <task-id> --container api --interactive --command /bin/sh` |
| Read the logs | CloudWatch Logs -> `/ecs/meeting-review-prod/api`, or `aws logs tail /ecs/meeting-review-prod/api --follow` |
| Database access | No public endpoint. Use ECS Exec (above) with `psql` if the image has it, or a temporary bastion/Session Manager host in a private subnet; credentials are in the `db-master` secret |

## Monthly cost drivers

Do not guess - put these into the [AWS Pricing Calculator](https://calculator.aws/)
for `eu-west-2`. In rough order of impact for a small deployment:

1. **NAT gateway** - hourly charge plus per-GB processing (one gateway here).
2. **RDS** - instance hours (`db.t4g.micro` by default), gp3 storage, backups
   beyond the free allowance; Multi-AZ doubles the instance cost.
3. **ECS Fargate** - vCPU and memory per hour (`512` CPU / `1024` MiB, one task).
4. **Application Load Balancer** - hourly charge plus capacity units.
5. **Amazon Transcribe** - per minute of audio transcribed (usage based, likely
   the largest variable cost if many meetings are processed).
6. **OpenRouter** - billed by OpenRouter per token, outside AWS.
7. **S3** - storage for recordings (limited by `recording_retention_days`), requests, data transfer.
8. **CloudFront** - requests and data transfer (small for an internal app).
9. **Secrets Manager** - per secret per month (6 secrets), **CloudWatch** logs/Container Insights, **SES** per email.

## Tear down

1. Export anything you need (RDS snapshot, S3 objects).
2. Deletion protection is on for RDS: set `deletion_protection = false` in
   `database.tf`, apply, then:
3. Empty the two S3 buckets (Terraform refuses to delete non-empty buckets):
   `aws s3 rm s3://<uploads-bucket> --recursive` and the same for the web bucket.
4. `terraform destroy`. A final RDS snapshot named `meeting-review-prod-db-final`
   is taken; delete it manually once you are sure.
5. Secrets are scheduled for deletion with a 7-day recovery window. Re-creating
   the stack within that window fails with "already scheduled for deletion";
   either wait or force-delete them: `aws secretsmanager delete-secret --secret-id <name> --force-delete-without-recovery`.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| ECS tasks keep stopping right after the first apply | No image in ECR yet - run *Deploy API* |
| API log: `self-signed certificate in certificate chain` | The `pg` driver verifies the RDS certificate against the system CA store. Either bake the RDS CA bundle into the image and set `NODE_EXTRA_CA_CERTS`, or set `db_connection_options = "sslmode=no-verify"` (still encrypted, no CA check) and apply, then *Deploy API* |
| `https://<domain>/api/...` returns 502 from CloudFront | The regional certificate does not cover `domain_name` (CloudFront validates it against the forwarded Host header) - reissue the certificate with the web domain included |
| ALB answers 403 "Forbidden" when called directly | Working as designed (`enforce_cloudfront_origin = true`); use the web domain or set `api_domain_name` |
| Browser upload fails with a CORS error | `WEB_ORIGIN`/the S3 CORS rule use `https://<domain_name>` - make sure you open the site on exactly that hostname (no `www.`) |
| Emails not delivered | SES sandbox (verify recipients or request production access) or the domain is not verified yet (check SES -> Identities) |
| `terraform apply` fails: OIDC provider already exists | Set `create_github_oidc_provider = false` |
| Deploy workflow: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Workflow is running on a branch other than `github_deploy_branch`, or `github_repository` is wrong |
