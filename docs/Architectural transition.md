Right now this application runs solely locally via Docker-Compose.

We're attempting to transition it to an architecture that can support
deployment in a public-facing cloud infrastructure. Right now, the system only runs locally.
This involves several steps:

1. Transition the projects from a multi-database to a schema-based multi-tenant architecture.
   This may retain some of the complexity of project management but with more manageable
   cluster-level management.
2. Work on topology efficiency and task-worker structure for topology updates
3. Prepare the system for running in K8s.
