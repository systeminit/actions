# System Initiative GitHub Actions

Use System Initiative workspaces in your GitHub workflows!

You can use this GitHub Action to take the following actions:

1. Update a component to set properties and subscriptions
2. Trigger a management function attached to a component

## Usage

### Update Component

Attributes in JSON format:

```yaml
- uses: systeminit/actions@v1
  with:
    changeSetName: CI
    component: testing-component
    attributes: |
      {
        "/domain/CidrBlock": "10.0.0.0/16",
        "/secrets/AWS Credential": {
          "$source": {
            "component": "demo-credential",
            "path": "/secrets/AWS Credential"
          }
        },
        "/domain/extra/Region": {
          "$source": {
            "component": "us-east-1",
            "path": "/domain/region"
          }
        }
      }
    apiToken: ${{ secrets.SI_API_TOKEN }}
```

Attributes in YAML format:

```yaml
- uses: systeminit/actions@v1
  with:
    changeSetName: CI
    component: testing-component
    attributes: |
      "/domain/CidrBlock": "10.0.0.0/16"
      "/secrets/AWS Credential":
        $source:
          component: "demo-credential"
          path: "/secrets/AWS Credential"
      "/domain/extra/Region":
        $source:
          component: "us-east-1"
          path: "/domain/region"
    apiToken: ${{ secrets.SI_API_TOKEN }}
```

### Trigger Managemet Function

```yaml
- uses: systeminit/actions@v1
  with:
    changeSetName: CI
    component: testing-component
    managementFunction: 'Run Template'
    apiToken: ${{ secrets.SI_API_TOKEN }}
```

### Input

The `with` section is where you put the input properties that tell SI what to
run and what properties to set:

- `apiToken` is the API token you use to access SI from GitHub Actions (see
  [Getting an API Token](#getting-an-api-token)). We recommend using a secret
  here, like `apiToken: ${{ secrets.SI_API_TOKEN }}`.
- `changeSetName` is the name of the change set to create when the action runs.
  (You may alternately specify `changeSetId` if you want to use an existing
  change set.)
- `componentId` is the ID of the component.
- `component` is the name of the component.
- `managementFunction` is the name of the management function to trigger on the
  component
- `attributes` is the list of prop paths you want to set on your component. You
  can specify the names of each property you want to set directly (like
  `/domain/CidrBlock`), followed by their value. Any properties you do not
  specify will be left alone with their current value.

  If you have a nested object (like a "point" object with "x", "y" and "z"
  properties) you can use a path to the individual property as its name (e.g.
  `"/domain/point/x": "100"`.

  You can also choose to specify prop subscriptions as part of the input, e.g.

```json
"/domain/extra/Region": {
  "$source": {
    "component": "us-east-1",
    "path": "/domain/region"
  }
}
```

```yaml
'/domain/extra/Region':
  $source:
    component: 'us-east-1'
    path: '/domain/region'
```

You may specify this as either YAML or JSON. (The `|` after `attributes:` is
important, as it must be passed in as a string!)

## Getting an API Token

To use these actions, you will need an API token. To get one:

1. Go to
   [https://auth.systeminit.com/workspaces](https://auth.systeminit.com/workspaces).
2. Click on the Gear icon in the workspace you'd like to use with System
   Initiative, and click API Tokens. ![alt text](docs/api-tokens.png)
3. Create an API token: fill in the name and how long before the token will
   expire, and click "Create API Token". ![alt text](docs/creating-token.png)
4. Click the Copy button at the bottom right to copy the token, so that you can
   paste it wherever you like. ![alt text](docs/created-token.png)

We recommend placing the secret into a
[GitHub secret](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions#creating-secrets-for-a-repository)
so you can access it in workflows with `{{ secrets.SI_API_TOKEN }}` (though you
can name it whatever you like)! The examples on this page all assume you have
placed it into a repository secret named SI_API_TOKEN.
