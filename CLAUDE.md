# Gendix Chat Instructions

## Introduction

This is Gendix Chat (the name is provisional; do not include it in the code or in any other artifacts unless specifically instructed to).
Its purpose is to be an artificial intelligence powered conversational agent used by small and medium size businesses to automate responses to their Whatsapp messages.
At least at first, Gendix Chat does not intend to support any kind of outbound messaging.
Rather, its main goal is to easily answer to common and sometimes time consuming queries submitted by end-users to our custumers quickly and accurately.

### Terminology note

- a *customer* is a business that is a paying user of our product;
- an *end-user* is anyone that we interact with on behalf of our customers;

## Technology Overview

At the center of Gendix Chat we have this codebase.
It is the server responsible for receiving all incoming communication, responding to it, as well as controlling administrative tasks such as new user onboarding and billing.
Open AI API is used to respond to end user queries.
Stripe is used for billing.
Resend is used for sending emails to our customers.

## Application Architecture

This application is written in Typescript and runs on Node v22.
It uses a streamlined hexagonal architecture.
In the core/ folder are the commands and queries that respond to business processes.
They should be just functions.
They must not perform any side effects directly.
Any kind of ambient interaction they require must be intermediated by port objects that they receive as arguments.
In the ports/ folder we have the implementations of such objects.
They are free to interact with databases, the filesystem and so on.
Each port should be implemented as a class, with public methods exposing their functionality.
Connecting the core and ports, we have the adapters/ folder.
Each adapter is a Typescript interface representing a set of functionalities exposed by a port.
Each port must then implement at least one such interface.
Beside the interfaces, the adapters folder should contain only auxiliary code, such as error classes that are thrown by some method.

So, we use inversion of control to structure the application, but there is not IOC container.
That is, the injection of dependencies happens manually.
Some of the top level, infrastructure related components of the application, such as scheduled event handlers or the web server are not abstracted and do not participate in component injection.
In other words, the composition roots are not centralized in the application root.
Rather, within each callback responding to events or HTTP requests we must manually instantiate the correct ports and pass them as arguments to the query or command necessary to handle the request.

## Code Organization

- We use Prettier for code-formatting. We use the standard configurations, except that we use tabs for formatting.
- We use ESLint for linting, with the standard configurations.
- We use Husky to manage git hooks.
- There is a pre-push to hook to ensure that the code builds, is formatted correctly and approved by the linter before it can be pushed.
- We use ES modules, without any transpilation. Therefore, imports should have the .js extension.

## Cloud Architecture

All the cloud architecture is managed via Terraform.
We use AWS for all of our cloud infrastructure.
The application runs directly on EC2 instances, via a Docker Swarm that we manage manually.
In front of EC2 we have an Application Load Balancer, which is what we expose to the internet.
The ELB is responsible for TLS termination, using an ACM emitted certificate.
Therefore, the application expects only HTTP traffic.
We use ECR for storing our container images.
We use RDS for the application database.

## CI/CD

We use Github Actions for CI/CD.
When the code is merged into the release branch in git a version tag must be created.
The tag is generated following semver.
We use conventional commits and so the commit messages must be inspected to know how the tag must be updated:
 - If all commit types are other than "feat" and there are no "breaking changes" paragraphs, the patch version must be updated.
 - If there are any "feat" commits, but no "breaking changes", the minor version must be updated.
 - If there are any "breaking changes", the major version should be updated.
The Docker image must then be built using the Dockerfile in the repository.
The image must use the tag we just generated in git.
The image is then pushed to ECR.

Notice that, at first, there is no automation for deploying the newly built images.
For the moment, we will SSH into EC2 and run Docker Swarm commands manually to pull in the new container versions.

## Database

Our database is a Postgresql instance running in RDS.
There is no need to avoid Postgresql specific functionality or restrict ourservel to ANSI SQL.
We must, however, take care to only use Postgresql features supported by RDS.
We use Kysely to intermediate all DB communication.
All primary keys must be UUIDs.

## HTTP

We use Hono for our HTTP server.

## Observability

We use Open Telemetry extensively to monitor the project.
In the cross-cutting/observability.ts module we define several helpers to instrument the code in the different ways.
It is expected that, to a first approximation, every function call within our own code should be traced, along with the values of all parameters.
It may not be possible to follow this ideal 100%, due to excessive chattiness and costs in our observability infrastructure.
However, the approach must be to first instrument everything and only remove instrumentation when necessary.
Functions must be instrumented at the point they are defined, not where they are invoked.

## AI specific instructions

Do not use explanatory comments.
