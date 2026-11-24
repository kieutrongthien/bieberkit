#!/bin/sh
# BieberKit
#
# @file        tools/test-services.sh
# @description Starts and stops the services that the integration tests need: PostgreSQL, MySQL, two Valkeys and an S3 server, tuned to be fast.
# @author      Bieber Kieu <kieutrongthien@gmail.com>
# @copyright   Copyright (c) 2026 Bieber Kieu
# @license     Apache-2.0
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0

set -eu

# The services of the integration tests, as containers that are thrown away. CI and a developer use the same script.
#   sh tools/test-services.sh start    starts them and waits until each answers
#   sh tools/test-services.sh env      prints the variables that the tests read, one KEY=value a line
#   sh tools/test-services.sh stop     removes them
# The ports are below 32768, the start of the range that Linux gives to outgoing connections: a port inside it can be held by a
# connection that some other program opened, and then the container cannot bind it.
# Locally:  sh tools/test-services.sh start && export $(sh tools/test-services.sh env | xargs) && pnpm test
#
# The data of PostgreSQL and MySQL is in memory and their durability is off: the tests make and drop databases all the time, and a server
# that syncs to a disk makes them time out. The cache Valkey evicts (allkeys-lru), the queue Valkey does not (noeviction): the
# tests of the queue and of the doctor check depend on both (Q-08). The images are pinned by digest, as in the services of CI.

POSTGRES='postgres:15@sha256:10f9e886f772e9d6484350b043bcf990ead67ae5d9988ddce265d72a299055d5'
MYSQL='mysql:8.4@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902'
VALKEY='valkey/valkey:8@sha256:5032c4dd7abe08d6fd9382054608183e2bf1f7e3895ef619b8784698454325f7'
MINIO='bitnamilegacy/minio@sha256:451fe6858cb770cc9d0e77ba811ce287420f781c7c1b806a386f6896471a349c'

NAMES='bk-test-pg bk-test-mysql bk-test-valkey bk-test-queue-valkey bk-test-s3'

stop() {
  # shellcheck disable=SC2086
  docker rm -f $NAMES >/dev/null 2>&1 || true
}

start() {
  stop
  docker run -d --rm --name bk-test-pg --tmpfs /var/lib/postgresql/data -e POSTGRES_PASSWORD=bk -p 25415:5432 "$POSTGRES" \
    -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=400 >/dev/null
  docker run -d --rm --name bk-test-mysql --tmpfs /var/lib/mysql -e MYSQL_ROOT_PASSWORD=bk -p 23384:3306 "$MYSQL" \
    --innodb-flush-log-at-trx-commit=0 --sync-binlog=0 --skip-log-bin --max-connections=500 --innodb-doublewrite=0 >/dev/null
  docker run -d --rm --name bk-test-valkey -p 26379:6379 "$VALKEY" \
    valkey-server --maxmemory-policy allkeys-lru --maxmemory 128mb >/dev/null
  docker run -d --rm --name bk-test-queue-valkey -p 26380:6379 "$VALKEY" \
    valkey-server --maxmemory-policy noeviction >/dev/null
  docker run -d --rm --name bk-test-s3 -p 29000:9000 -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin "$MINIO" >/dev/null

  tries=0
  # Over TCP, because both servers first run a temporary one that listens on a socket only, and then restart.
  until docker exec bk-test-pg pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 \
    && docker exec bk-test-mysql mysql -h 127.0.0.1 -P 3306 -uroot -pbk -e 'select 1' >/dev/null 2>&1 \
    && docker exec bk-test-valkey valkey-cli ping >/dev/null 2>&1 \
    && docker exec bk-test-queue-valkey valkey-cli ping >/dev/null 2>&1 \
    && curl -sf http://127.0.0.1:29000/minio/health/live >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -gt 90 ]; then
      echo 'The test services did not answer in 3 minutes.' >&2
      docker ps -a >&2
      exit 1
    fi
    sleep 2
  done
  echo 'The test services answer.' >&2
}

env_lines() {
  cat <<'ENV'
DATABASE_URL_POSTGRES=postgres://postgres:bk@127.0.0.1:25415/postgres
DATABASE_URL_MYSQL=mysql://root:bk@127.0.0.1:23384/mysql
CACHE_TEST_REDIS_URL=redis://127.0.0.1:26379
QUEUE_TEST_REDIS_URL=redis://127.0.0.1:26380
STORAGE_TEST_S3_ENDPOINT=http://127.0.0.1:29000
BK_REQUIRE_DIALECTS=all
ENV
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  env) env_lines ;;
  *)
    echo 'Usage: sh tools/test-services.sh start|stop|env' >&2
    exit 2
    ;;
esac
