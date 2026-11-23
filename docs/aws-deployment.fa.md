# استقرار و بازیابی دیدبان مالی روی AWS

تصمیم استقرار در ۲۰۲۶/۱۱/۲۳ ثبت شد. وب Next.js، API، worker و ClamAV به‌صورت سرویس‌های ECS Fargate اجرا می‌شوند. یک بارگذار HTTPS مسیر `/api/*` را به API و بقیه را به وب می‌فرستد. RDS PostgreSQL داده‌های مالی و EFS خصوصی اصل فایل‌ها را نگه می‌دارند. API و worker همان مسیر فایل و صف PostgreSQL فعلی را استفاده می‌کنند. [قالب CloudFormation](../infra/aws/stack.yaml)

## پیش‌نیازهای محیط

- یک حساب/منطقهٔ AWS، یک VPC با DNS فعال، دو subnet عمومی برای بارگذار و دو subnet خصوصی در دو Availability Zone متفاوت. subnetهای خصوصی برای ECR، Secrets Manager، CloudWatch، دریافت امضاهای ClamAV و در صورت فعال بودن، ECS Exec، مسیر خروجی لازم داشته باشند. هیچ task، پایگاه داده یا اسکنری IP عمومی دریافت نمی‌کند.
- یک زیردامنه و گواهی ACM معتبر در منطقهٔ بارگذار. برای staging از زیردامنه و stack جداگانه با نام حروف کوچک، مانند `didban-staging`، استفاده کنید. در DNS یک Alias یا CNAME به خروجی `LoadBalancerDns` بدهید. `IngressCidr` را به محدودهٔ شبکهٔ کاربران یا VPN سازمان محدود کنید. CIDRهای خود subnetهای بارگذار را در `AlbSubnetCidrs` بدهید تا Uvicorn فقط هدر IP ارسال‌شده از همان شبکه را بپذیرد. بارگذار از حالت پیش‌فرض افزودن IP واقعی کلاینت استفاده می‌کند.
- AWS CLI احراز هویت‌شده، Docker Buildx و سه مخزن ECR خصوصی در همان منطقه. سیاست tag غیرقابل‌تغییر را برای مخزن‌ها فعال کنید. CI اعتبارسنجی قالب را اجرا می‌کند. انتشار اولیه به AWS با دسترسی اپراتور انجام می‌شود.
- CloudFormation برای نقش‌های IAM به `CAPABILITY_IAM` نیاز دارد. قبل از apply برآورد ALB، Fargate، RDS، EFS، NAT و پشتیبان را در منطقهٔ انتخابی بررسی کنید. برای staging می‌توانید `DatabaseMultiAz=false` و `WebAndApiReplicas=1` بدهید. برای تولید، پیش‌فرض RDS چندناحیه‌ای و دو تسک برای هر یک از وب و API است. worker و اسکنر هر کدام یک نمونه دارند و در حساب دسترس‌پذیری باید منظور شوند.

## ساخت و ثبت نسخه

از یک checkout تمیز و نسخهٔ بازبینی‌شده بسازید. ابتدا `AWS_REGION` و `ECR` را تنظیم کنید. `ECR` نام میزبان registry است. تصویرهای وب، API و اسکنر باید `linux/amd64` را پشتیبانی کنند.

```sh
release=$(git rev-parse --short=12 HEAD)
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$ECR"

docker buildx build --platform linux/amd64 --push \
  --file apps/api/Dockerfile --target aws --tag "$ECR/didban-api:$release" .
docker buildx build --platform linux/amd64 --push \
  --file apps/web/Dockerfile --tag "$ECR/didban-web:$release" .
docker pull --platform linux/amd64 clamav/clamav-debian:1.5.4
docker tag clamav/clamav-debian:1.5.4 "$ECR/didban-scanner:$release"
docker push --platform linux/amd64 "$ECR/didban-scanner:$release"

for repository in didban-api didban-web didban-scanner; do
  digest=$(aws ecr describe-images --repository-name "$repository" \
    --image-ids "imageTag=$release" --query 'imageDetails[0].imageDigest' --output text)
  printf '%s/%s@%s\n' "$ECR" "$repository" "$digest"
done
```

سه URI خروجی را به‌عنوان `ApiImage`، `WebImage` و `ScannerImage` بدهید. تصویر API از هدف `aws` فایل CA رسمی RDS را می‌گیرد و اتصال PostgreSQL را با `sslmode=verify-full` انجام می‌دهد. برای استقرار نسخهٔ بعد، digestها را در change set بررسی کنید. حالت عادی Compose همچنان از هدف پیش‌فرض Dockerfile استفاده می‌کند.

## اولین استقرار staging

1. قالب را اعتبارسنجی و change set را با `StartServices=false` ایجاد کنید. تنظیمات نمونهٔ زیر از متغیرهای محیط اپراتور خوانده می‌شوند. `PUBLIC_SUBNETS` و `ALB_SUBNET_CIDRS` دو مقدار جداشده با کاما هستند. برای ساخت نخستین حساب، `EnableApiExec=true` را فقط در زمان راه‌اندازی بدهید.

   ```sh
   aws cloudformation validate-template --template-body file://infra/aws/stack.yaml
   aws cloudformation deploy --stack-name "$STACK" \
     --template-file infra/aws/stack.yaml --capabilities CAPABILITY_IAM \
     --no-execute-changeset \
     --parameter-overrides \
     "VpcId=$VPC_ID" "PublicSubnets=$PUBLIC_SUBNETS" "AlbSubnetCidrs=$ALB_SUBNET_CIDRS" \
     "PrivateSubnetA=$PRIVATE_SUBNET_A" "PrivateSubnetB=$PRIVATE_SUBNET_B" \
     "Domain=$DOMAIN" "CertificateArn=$CERTIFICATE_ARN" "IngressCidr=$INGRESS_CIDR" \
     "ApiImage=$API_IMAGE" "WebImage=$WEB_IMAGE" "ScannerImage=$SCANNER_IMAGE" \
     StartServices=false DatabaseMultiAz=false WebAndApiReplicas=1 EnableApiExec=true
   ```

   change set را در CloudFormation بازبینی و اجرا کنید. محافظ حذف stack را در حساب فعال کنید. snapshot پایگاه، EFS و راز نقش برنامه طبق سیاست قالب حفظ می‌شوند.

2. پس از تکمیل stack، فرمان `infra/aws/bootstrap-db.sh "$STACK"` را اجرا کنید. وظیفهٔ یک‌باره رمز مدیریت‌شدهٔ RDS را فقط برای ساخت نقش محدود `didban_app` دریافت می‌کند. سرویس‌های API و worker فقط رمز همان نقش محدود را دریافت می‌کنند. اجرای دوباره، ورود با رمز فعلی را می‌سنجد و رمز نقش موجود را تغییر نمی‌دهد.
3. در update stack، مقادیر قبلی را حفظ و `StartServices=true` را اعمال کنید. در ECS وضعیت چهار سرویس و در CloudWatch پیام‌های startup را بررسی کنید. DNS را از شبکهٔ مجاز امتحان کنید و انتظار پاسخ `200` با `status: ok` و `deployment_mode: production` داشته باشید.

   ```sh
   curl --fail --silent --show-error "https://$DOMAIN/api/v1/health"
   ```

4. برای ساخت نخستین حساب، از یک نشست مجاز ECS Exec روی کانتینر API استفاده کنید. `CLUSTER` و نام سرویس را از خروجی stack بگیرید. `TASK_ARN` باید تسک فعال همان سرویس باشد. ایمیل و نام شرکت نمونه را با دادهٔ آزمایشی جایگزین کنید. رمز در ترمینال به‌صورت تعاملی وارد می‌شود.

   ```sh
   aws ecs execute-command --cluster "$CLUSTER" --task "$TASK_ARN" \
     --container api --interactive \
     --command "python /app/scripts/aws_runtime.py python /app/scripts/bootstrap.py --email admin@example.com --name 'مدیر آزمایش' --admin --company 'شرکت آزمایشی'"
   ```

   بعد از راه‌اندازی، `EnableApiExec=false` کنید و سرویس API را با `force-new-deployment` جایگزین کنید تا هیچ تسک قدیمی با ECS Exec فعال باقی نماند. برای کارهای مدیریتی بعدی دسترسی مستقل اپراتور را ثبت کنید.
5. با دادهٔ مصنوعی ورود، جداسازی دو شرکت، آپلود Excel/CSV و تولید گزارش را در مرورگر آزمایش کنید. سالم بودن مسیر health فقط اتصال DB را می‌سنجد. سلامت اسکنر، حرکت صف و پاسخ آپلود در هنگام قطعی اسکنر را جداگانه بررسی کنید. مسیر readiness برای بررسی مستقیم از شبکهٔ عملیاتی در دسترس است و بارگذار دسترسی بیرونی به آن را مسدود می‌کند.

## پشتیبان، بازیابی و انتقال به تولید

- RDS با نگهداری ۱۴روزه و EFS با پشتیبان‌گیری خودکار تعریف شده‌اند. وضعیت موفقیت اولین backup هر دو را بررسی کنید. مسئول زیرساخت، مقصد هشدار و اهداف زمان بازیابی و حداکثر دادهٔ قابل‌از‌دست‌رفتن را ثبت کنید. هشدارهای ALB 5xx، سرویس ناپایدار، خطای تکرارشوندهٔ worker، ظرفیت RDS و شکست backup را پیش از پذیرش تولید وصل و آزمایش کنید.
- برای نقطهٔ بازیابی مشترک، روی staging ابتدا ورود و آپلود را متوقف کنید، به کارهای در جریان فرصت پایان بدهید و سپس سرویس‌های نویسنده را متوقف کنید. با `StartServices=false` هر چهار سرویس متوقف می‌شوند. در این پنجره یک snapshot دستی RDS و یک recovery point از EFS بسازید. شناسه‌های هر دو، زمان UTC، digest تصاویر و نسخهٔ schema را کنار هم ثبت کنید. بعد از ساخت موفق نقطه‌های بازیابی، سرویس‌ها را برگردانید.
- snapshot RDS و recovery point فایل‌ها را به منابع **جداگانه** برگردانید. AWS Backup ممکن است فایل‌ها را در مسیر بازیابی مجزا قرار دهد. محتوای بازیابی‌شده باید با مالکیت POSIX مناسب در ریشهٔ access point نصب بازیابی، در مسیر `/didban`، قرار گیرد. در DB بازیابی‌شده از همان نسخهٔ برنامه و یک نقش محدود با رمز مستقل بازیابی استفاده کنید. بعد از بازگرداندن، کنترل نقش و RLS، هش و دسترسی فایل‌ها، گزارش‌های قبلی، ورود، آپلود تازه و پردازش worker را انجام دهید. زمان واقعی را ثبت کنید. `scripts/restore.py` مسیر PostgreSQL/RDS را پوشش نمی‌دهد.
- پیش از انتقال DNS تولید، همین digestهای پذیرفته‌شده را در stack تولید با منابع، اسرار و دامنهٔ جدا مستقر کنید. برای نصب داده‌دار، نسخهٔ schema و migration صریح را روی کپی داده‌ها بررسی کنید. برگشت image فقط در صورت سازگاری schema با نسخهٔ قبل انجام شود. برای تست staging از دادهٔ مالی واقعی، توکن ارسال یا اتصال مؤدیان عملیاتی استفاده نکنید.

## وضعیت تأیید

در ۲۰۲۶/۱۱/۲۳، YAML، ارجاع‌های CloudFormation و نبود چرخهٔ وابستگی به‌صورت محلی بررسی شدند. اسکریپت راه‌اندازی با جایگزین محلی AWS CLI و PostgreSQL در حالت موفق، ناموفق و نقش نامعتبر بررسی شد. Ruff و پنج آزمون موجود بازیابی SQLite و API سلامت موفق بودند. اعتبارسنجی رسمی قالب و ساخت image در این محیط انجام نشدند. حساب AWS در دسترس نبود و Docker daemon دسترسی نداد. انتشار ECR، اجرای staging، اتصال واقعی scanner و تمرین بازیابی RDS/EFS باز هستند. قرارداد API و مدل پایگاه داده با این تغییرات ثابت‌اند.
