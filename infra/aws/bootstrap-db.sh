#!/bin/sh
# Run the one-off RDS role bootstrap in the stack's private network.
set -eu

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 CLOUDFORMATION_STACK_NAME" >&2
    exit 2
fi
stack="$1"
export AWS_PAGER=""

output() {
    aws cloudformation describe-stacks --stack-name "$stack"         --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
}

cluster="$(output Cluster)"
definition="$(output BootstrapTask)"
security_group="$(output BootstrapSecurityGroup)"
subnets="$(output BootstrapSubnets)"
log_group="$(output LogGroup)"

task="$(aws ecs run-task --cluster "$cluster" --task-definition "$definition"     --launch-type FARGATE --platform-version 1.4.0     --network-configuration "awsvpcConfiguration={subnets=[$subnets],securityGroups=[$security_group],assignPublicIp=DISABLED}"     --query tasks[0].taskArn --output text)"
if [ -z "$task" ] || [ "$task" = "None" ]; then
    echo "ECS did not start the database bootstrap task." >&2
    exit 1
fi

aws ecs wait tasks-stopped --cluster "$cluster" --tasks "$task"
status="$(aws ecs describe-tasks --cluster "$cluster" --tasks "$task"     --query 'tasks[0].containers[?name==`bootstrap`].exitCode | [0]' --output text)"
if [ "$status" != "0" ]; then
    printf 'Bootstrap task failed. Task: %s\nLog group: %s\n' "$task" "$log_group" >&2
    exit 1
fi
printf 'Restricted database role verified. Task: %s\n' "$task"
