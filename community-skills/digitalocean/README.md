# DigitalOcean

Integrate with DigitalOcean to list, create, list and more.

## Tools

- **List Droplets** (`do_list_droplets`) — List all droplets (virtual machines) in the DigitalOcean account. Returns names, IDs, regions, sizes, and statuses.
- **Create Droplet** (`do_create_droplet`) — Create a new DigitalOcean droplet. Specify the name, region, size, and image.
- **List Databases** (`do_list_databases`) — List all managed database clusters in the DigitalOcean account. Returns engines, versions, regions, and statuses.
- **List Domains** (`do_list_domains`) — List all domains registered in the DigitalOcean account. Returns domain names and TTL values.
- **Get Account** (`do_get_account`) — Get DigitalOcean account information including email, droplet limit, team membership, and verification status.

## Configuration

| Field | Type | Description |
|-------|------|-------------|
| Auth | token | digitalocean authentication |

## Category

cloud-infrastructure · Risk: high
