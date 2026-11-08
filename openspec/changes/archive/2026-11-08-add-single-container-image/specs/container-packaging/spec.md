# Spec Delta

## Purpose

Lets an operator run the entire LessonLab stack — web, worker, database, and cache — from one self-contained container image, and publish that image to a container registry.

## ADDED Requirements

### Requirement: Self-contained image build

The build SHALL produce a single image that contains the web application, the background worker, a PostgreSQL server, a Redis server, and the process supervision needed to run them together. The image SHALL be built from the existing Docker build definition without requiring Compose.

#### Scenario: Building the image

- **WHEN** an operator builds the all-in-one image target from the repository
- **THEN** the build completes successfully and the resulting image contains the web application, worker, PostgreSQL, and Redis

#### Scenario: Building without Compose

- **WHEN** the operator builds the image on a host with Docker but without Docker Compose
- **THEN** the build succeeds

#### Scenario: Existing deployment targets remain available

- **WHEN** an operator builds the web or worker targets used by the Compose stack
- **THEN** those targets still build with unchanged behavior

### Requirement: Whole stack in one container

Running the image SHALL start the web server, the worker, PostgreSQL, and Redis inside that container without any external database or cache service.

#### Scenario: Starting the container

- **WHEN** the container starts with valid configuration
- **THEN** the web server, worker, PostgreSQL, and Redis all become running processes in that container

#### Scenario: No external dependencies

- **WHEN** the container runs on a host with no PostgreSQL or Redis service available
- **THEN** the application still starts and serves requests

#### Scenario: Web and worker share state

- **WHEN** a lesson is uploaded through the web process
- **THEN** the worker process in the same container can pick up and process it

### Requirement: Ordered startup

The container SHALL initialize persistent data storage on first run, wait for PostgreSQL and Redis to accept connections, apply database migrations, and only then start the web server and worker.

#### Scenario: First run with an empty volume

- **WHEN** the container starts with an empty data volume
- **THEN** the database is initialized, migrations are applied, and the web server and worker start successfully

#### Scenario: Database not yet accepting connections

- **WHEN** PostgreSQL has been launched but is not yet accepting connections
- **THEN** migrations and application processes wait instead of failing immediately

#### Scenario: Migration failure

- **WHEN** database migrations fail
- **THEN** the web server and worker are not started and the container exits with a non-zero status

#### Scenario: Restart with existing data

- **WHEN** the container restarts using an existing data volume
- **THEN** it reuses the existing database, applies any pending migrations, and starts the application processes

### Requirement: Container health reporting

The container SHALL report healthy only when the web server can serve requests and the application's health check confirms database, cache, and storage readiness.

#### Scenario: Healthy stack

- **WHEN** all processes are running and the application health check reports `ok`
- **THEN** the container reports healthy

#### Scenario: Unhealthy dependency

- **WHEN** the database or cache is unavailable inside the container
- **THEN** the application health check reports degraded and the container does not report healthy

### Requirement: Persistent state across restarts

The container SHALL keep PostgreSQL data, Redis data, uploaded files, and rendered media on a single persistent volume, and SHALL recreate them only when that volume is absent.

#### Scenario: State survives a restart

- **WHEN** the container is stopped and started again with the same volume
- **THEN** classes, lessons, uploaded files, rendered media, and queued or completed jobs are still present

#### Scenario: Fresh volume

- **WHEN** the container starts with a new empty volume
- **THEN** it initializes a new database, cache, and media store instead of failing on missing data

#### Scenario: Volume removed

- **WHEN** the persistent volume is deleted
- **THEN** all application state is lost, and the next start behaves like a first run

### Requirement: Environment-based configuration

The container SHALL read application and embedded-database configuration from environment variables and SHALL default internal database and cache connections to the services running inside the container.

#### Scenario: Required secrets absent

- **WHEN** a required secret such as `AUTH_SECRET` or the teacher credential is missing or invalid
- **THEN** the container fails fast with a diagnostic message instead of serving traffic

#### Scenario: Defaults for internal services

- **WHEN** the operator supplies only the application secrets and does not set `DATABASE_URL` or `REDIS_URL`
- **THEN** the application connects to the PostgreSQL and Redis instances in the same container

#### Scenario: Explicit overrides

- **WHEN** the operator sets `DATABASE_URL`, `REDIS_URL`, `STORAGE_ROOT`, or `APP_BASE_URL`
- **THEN** the container uses the supplied values instead of its defaults

#### Scenario: Embedded database credentials

- **WHEN** the operator sets the embedded PostgreSQL user, password, or database name
- **THEN** the database is initialized with those values and the application uses a matching connection

### Requirement: Coordinated shutdown

The container SHALL stop the web server, worker, PostgreSQL, and Redis on a termination signal, allow in-flight work to finish within a bounded grace period, and exit with a status that reflects whether any process failed.

#### Scenario: Graceful stop

- **WHEN** the container receives `SIGTERM`
- **THEN** the worker and web server stop, PostgreSQL and Redis shut down cleanly, and the container exits

#### Scenario: Failure of a core process

- **WHEN** the web server, worker, PostgreSQL, or Redis exits unexpectedly
- **THEN** the container stops the remaining processes and exits with a non-zero status

#### Scenario: Repeated restart

- **WHEN** the container is stopped and started repeatedly with the same volume
- **THEN** it starts cleanly each time without stale process locks or partially initialized data

### Requirement: Registry publication script

The project SHALL provide a script that builds the all-in-one image for `linux/amd64`, tags it with `latest`, the current git commit, and an optional version, and pushes it to `karanaso/openclass` on Docker Hub.

#### Scenario: Successful push

- **WHEN** the operator runs the push script while authenticated to Docker Hub
- **THEN** the image is built for `linux/amd64` and pushed with the `latest` and commit tags

#### Scenario: Version tag

- **WHEN** the operator supplies a version argument or environment value
- **THEN** the image is also tagged and pushed with that version

#### Scenario: Not authenticated

- **WHEN** the operator runs the script without a Docker Hub login
- **THEN** the script exits with a clear error before pushing and does not report success

#### Scenario: Repository override

- **WHEN** the operator sets an image repository environment variable
- **THEN** the script pushes to that repository instead of the default

#### Scenario: Dry run

- **WHEN** the operator requests a dry run
- **THEN** the script reports the build and tags it would produce without pushing

### Requirement: Single-container documentation

The README and deployment documentation SHALL explain how to build, run, configure, persist, upgrade, and publish the all-in-one image, and SHALL state its limitations compared with the Compose deployment.

#### Scenario: Operator follows the README

- **WHEN** an operator reads the README with no prior project knowledge
- **THEN** they can build the image, run it with the required environment variables, and reach the app

#### Scenario: Limitations are documented

- **WHEN** an operator considers the single-container mode for production
- **THEN** the documentation states that it is intended for demos, evaluation, and small single-node use, and does not provide the scaling, backup, or isolation of the Compose stack

#### Scenario: Publishing is documented

- **WHEN** a maintainer needs to publish a release image
- **THEN** the documentation shows the authentication, versioning, and push command
