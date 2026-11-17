# Hosting TableDash on AWS

TableDash runs on **AWS Lightsail** (servers and database) plus **S3 + CloudFront** (the two mobile web apps).
Everything is created and updated from GitHub. You only do the account steps below once.

| Part | Where it runs | Rough cost |
|---|---|---|
| API server | Lightsail container service, Micro (always on) | ~$10/month |
| Restaurant back office (web) | Lightsail container service, Nano | ~$7/month |
| Admin console | Lightsail container service, Nano | ~$7/month |
| Database (PostgreSQL, private, daily backups kept 7 days) | Lightsail managed database, smallest plan | ~$15/month |
| Diner app + restaurant app (web / installable) | S3 + CloudFront | cents |
| **Total** | | **about $40/month** |

New AWS accounts often get some Lightsail plans free for the first months. Check the
[Lightsail pricing page](https://aws.amazon.com/lightsail/pricing/) for current prices.

---

## One-time setup (about 15 minutes of clicking, then 30–40 minutes of waiting)

### 1. Create an AWS account
Sign up at <https://aws.amazon.com>. You need a card and a phone number.
Then turn on two-step sign-in (MFA) for the account: top-right menu → **Security credentials** → **Assign MFA device**.

### 2. Give GitHub a key that can only manage TableDash
1. In the AWS console, open **IAM** → **Policies** → **Create policy** → **JSON** tab.
   Delete what's there, paste the contents of [`iam-policy.json`](./iam-policy.json), **Next**, name it `TableDashDeploy`, **Create policy**.
2. **IAM** → **Users** → **Create user**. Name: `tabledash-github`. Leave console access off. **Next**.
3. Choose **Attach policies directly**, tick `TableDashDeploy`, **Next**, **Create user**.
4. Open the new user → **Security credentials** → **Create access key** → choose
   **Application running outside AWS** → **Next** → **Create access key**.
   Keep this page open: you need both values in the next step. Don't paste them into chats or emails.

### 3. Put the key in GitHub (encrypted; never visible in the code)
In the GitHub repo: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Add:

| Name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | the Access key from step 2 |
| `AWS_SECRET_ACCESS_KEY` | the Secret access key from step 2 |
| `GOOGLE_MAPS_API_KEY` | *(optional)* your **new** Google key, for Google photos, ratings and search |

Using a region other than US East (N. Virginia)? Also open the **Variables** tab and add
`AWS_REGION` with the region code, for example `eu-central-1` for Frankfurt.

### 4. Run the setup
GitHub repo → **Actions** → **AWS setup** (left list) → **Run workflow** → keep or change the region → **Run workflow**.

It takes 30–40 minutes, mostly waiting for AWS to create the database.
When it turns green, open the run. The **summary** lists the addresses of every app.

After that, **every push to `main` deploys automatically** (the **Deploy to AWS** workflow).
You can also run **Deploy to AWS** by hand and pick just one part (api, web or mobile).

### 5. Switch off Render
Once the AWS addresses work, suspend the services in the Render dashboard (or delete the Blueprint)
so there's only one live copy.

---

## Good to know

- **Data:** the AWS database starts with the same demo restaurants and logins as before
  (password `password123`). Nothing from Render is copied; it only held test bookings.
- **Test mode is still on.** Diners' phone login codes are shown on screen (no SMS provider yet) and demo
  logins exist. Before real users: add an SMS provider, set `SHOW_DEV_OTP` to `false` in `infra/aws/deploy.sh`,
  and replace the demo accounts.
- **The database is private.** Only your Lightsail services in the same region can reach it.
  To look at it with a database tool, turn on *Public mode* in Lightsail → Databases → Networking for a moment.
- **Logs:** Lightsail console → **Containers** → pick a service → **Logs**.
- **Your own web address** (e.g. app.tabledash.com) can be added later: Lightsail containers have a
  *Custom domains* tab, and CloudFront sites take an alternate domain with a free certificate.

## If something goes wrong

| Message | What to do |
|---|---|
| `Add AWS_ACCESS_KEY_ID ...` | Step 3 isn't done, or the secret names are misspelled. |
| `AccessDenied` / `not authorized` | The `TableDashDeploy` policy isn't attached to the `tabledash-github` user. |
| CloudFront: *your account must be verified* | New AWS accounts are sometimes held back. Open a free AWS Support case asking to enable CloudFront, then re-run **AWS setup**. |
| `... did not start. The log above shows why.` | Open the failed run; the server's last log lines are printed right there. |
| Database still creating | Re-run **AWS setup**. It skips everything that already exists and carries on. |
