#!/usr/bin/env bash
# Initialize DynamoDB Local tables for all challenge options.
# Run this if the dynamodb-init Docker container didn't create tables.

set -euo pipefail

ENDPOINT="${DYNAMODB_ENDPOINT:-http://localhost:8000}"
REGION="${AWS_REGION:-us-east-1}"

AWS_OPTS="--endpoint-url $ENDPOINT --region $REGION"

echo "Creating DynamoDB tables at $ENDPOINT..."

# WebSocket connections table (Option B)
aws dynamodb create-table $AWS_OPTS \
  --table-name connections \
  --attribute-definitions \
    AttributeName=connectionId,AttributeType=S \
    AttributeName=tableSubscription,AttributeType=S \
  --key-schema AttributeName=connectionId,KeyType=HASH \
  --global-secondary-indexes '[{"IndexName":"tableSubscription-index","KeySchema":[{"AttributeName":"tableSubscription","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"},"ProvisionedThroughput":{"ReadCapacityUnits":5,"WriteCapacityUnits":5}}]' \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  2>/dev/null && echo "  Created: connections" || echo "  Exists:  connections"

# Rewards tables (Option A)
aws dynamodb create-table $AWS_OPTS \
  --table-name rewards-players \
  --attribute-definitions AttributeName=playerId,AttributeType=S \
  --key-schema AttributeName=playerId,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  2>/dev/null && echo "  Created: rewards-players" || echo "  Exists:  rewards-players"

aws dynamodb create-table $AWS_OPTS \
  --table-name rewards-transactions \
  --attribute-definitions \
    AttributeName=playerId,AttributeType=S \
    AttributeName=timestamp,AttributeType=N \
  --key-schema AttributeName=playerId,KeyType=HASH AttributeName=timestamp,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  2>/dev/null && echo "  Created: rewards-transactions" || echo "  Exists:  rewards-transactions"

# Streaks tables (Option C)
aws dynamodb create-table $AWS_OPTS \
  --table-name streaks-players \
  --attribute-definitions AttributeName=playerId,AttributeType=S \
  --key-schema AttributeName=playerId,KeyType=HASH \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  2>/dev/null && echo "  Created: streaks-players" || echo "  Exists:  streaks-players"

aws dynamodb create-table $AWS_OPTS \
  --table-name streaks-activity \
  --attribute-definitions \
    AttributeName=playerId,AttributeType=S \
    AttributeName=date,AttributeType=S \
  --key-schema AttributeName=playerId,KeyType=HASH AttributeName=date,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  2>/dev/null && echo "  Created: streaks-activity" || echo "  Exists:  streaks-activity"

aws dynamodb create-table $AWS_OPTS \
  --table-name streaks-rewards \
  --attribute-definitions \
    AttributeName=playerId,AttributeType=S \
    AttributeName=rewardId,AttributeType=S \
  --key-schema AttributeName=playerId,KeyType=HASH AttributeName=rewardId,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  2>/dev/null && echo "  Created: streaks-rewards" || echo "  Exists:  streaks-rewards"

aws dynamodb create-table $AWS_OPTS \
  --table-name streaks-freeze-history \
  --attribute-definitions \
    AttributeName=playerId,AttributeType=S \
    AttributeName=date,AttributeType=S \
  --key-schema AttributeName=playerId,KeyType=HASH AttributeName=date,KeyType=RANGE \
  --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
  2>/dev/null && echo "  Created: streaks-freeze-history" || echo "  Exists:  streaks-freeze-history"

echo "Done. All DynamoDB tables ready."
