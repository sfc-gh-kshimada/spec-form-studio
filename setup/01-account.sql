-- 01: account-level objects. Run as ACCOUNTADMIN.
-- Creates the two roles the app uses, the egress rule the server-side build
-- needs to reach the npm registry, and the grants that let the publisher role
-- own an application service.
USE ROLE ACCOUNTADMIN;

CREATE DATABASE IF NOT EXISTS __DB__;
CREATE SCHEMA IF NOT EXISTS __DB__.__SCHEMA__;
CREATE WAREHOUSE IF NOT EXISTS __WAREHOUSE__
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;

CREATE ROLE IF NOT EXISTS __PUBLISHER_ROLE__;
CREATE ROLE IF NOT EXISTS __REVIEWER_ROLE__;

-- 'npm ci' runs inside Snowflake during the build phase. Remote builds already
-- reach registry.npmjs.org by default (account parameter
-- ALLOW_NPM_PACKAGE_DOWNLOAD), so this integration is only needed where an
-- administrator turned that default off. A trial account cannot create one at
-- all — "External access is not supported for trial accounts" — so
-- bootstrap-trial.sh drops the block below when SFS_BUILD_EAI is empty.
-- >>> BUILD_EAI
CREATE NETWORK RULE IF NOT EXISTS __DB__.__SCHEMA__.NPM_BUILD_NETWORK
  MODE = EGRESS TYPE = HOST_PORT VALUE_LIST = ('registry.npmjs.org');
CREATE EXTERNAL ACCESS INTEGRATION IF NOT EXISTS __BUILD_EAI__
  ALLOWED_NETWORK_RULES = (__DB__.__SCHEMA__.NPM_BUILD_NETWORK) ENABLED = TRUE;
GRANT USAGE ON INTEGRATION __BUILD_EAI__ TO ROLE __PUBLISHER_ROLE__;
-- <<< BUILD_EAI

GRANT CREATE APPLICATION SERVICE, CREATE ARTIFACT REPOSITORY, CREATE STAGE
  ON SCHEMA __DB__.__SCHEMA__ TO ROLE __PUBLISHER_ROLE__;
GRANT USAGE ON DATABASE __DB__ TO ROLE __PUBLISHER_ROLE__;
GRANT USAGE ON DATABASE __DB__ TO ROLE __REVIEWER_ROLE__;
GRANT USAGE ON SCHEMA __DB__.__SCHEMA__ TO ROLE __PUBLISHER_ROLE__;
GRANT USAGE ON SCHEMA __DB__.__SCHEMA__ TO ROLE __REVIEWER_ROLE__;
GRANT USAGE ON WAREHOUSE __WAREHOUSE__ TO ROLE __PUBLISHER_ROLE__;
GRANT USAGE ON WAREHOUSE __WAREHOUSE__ TO ROLE __REVIEWER_ROLE__;
GRANT ROLE __PUBLISHER_ROLE__ TO USER __OWNER_USER__;
GRANT ROLE __REVIEWER_ROLE__ TO USER __OWNER_USER__;

-- The objects do not exist yet, so ownership of what 02 creates is granted in 05.
