# Indoor Orienteering Route Analysis

This is an experimental web application for analyzing and optimizing indoor orienteering courses. It is intended to run 100% on the client side, with no server-side components. The application can be used as a web app, a desktop app, MCP server or command-line tools. The web app can be run locally, in a container or easily hosted on any server that supports static file hosting. 

## Contributing

The best way to contribute is to create issues in the GitHub repo with specific feature requests or bug reports. 

## How to run the application

To run the web app locally in development mode:

```
pnpm install
pnpm dev
```

To run the web app in a container:

```
docker build -t indoor-o-route-analysis .
docker run -p 3000:3000 indoor-o-route-analysis
```

## Example events

File → Examples loads events from [objorke/indoor-o-data](https://github.com/objorke/indoor-o-data/tree/main/events).
Add your own repositories (any `index.json` URL) in Settings → Examples. See [docs/example-repositories.md](docs/example-repositories.md).
