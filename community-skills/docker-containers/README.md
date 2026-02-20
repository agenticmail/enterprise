# Docker Containers

Manage Docker containers, images, and volumes. Start, stop, and inspect running containers.

## Installation

Install this skill from the AgenticMail skill marketplace:

```
agenticmail skills install docker-containers
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | No | Docker daemon URL. Defaults to `unix:///var/run/docker.sock` |
| `tlsCert` | string | No | TLS client certificate for Docker daemon authentication |
| `tlsKey` | string | No | TLS client private key for Docker daemon authentication |
| `tlsCa` | string | No | TLS CA certificate for Docker daemon authentication |

## Tools

### List Containers (`docker_list_containers`)
List running and stopped containers.

### Start Container (`docker_start_container`)
Start a stopped container.

### Stop Container (`docker_stop_container`)
Stop a running container.

### Inspect Container (`docker_inspect`)
Get detailed container information.

## License

Apache-2.0
