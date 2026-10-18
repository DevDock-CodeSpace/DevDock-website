# Cloud provider icons

Official architecture icons, a curated subset, used by the diagram editor (`../cloud.ts`).
File names are the saved keys without their provider prefix (`aws/lambda.svg` is `aws-lambda`): never rename one.

| Folder | Source | Terms |
|---|---|---|
| `aws/` | AWS Architecture Icons, from the `aws-icons` npm package 3.3.0 (`icons/architecture-service`, MIT packaging of the official set) | AWS allows the icons in architecture diagrams |
| `azure/` | Azure Public Service Icons V21, `arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V21.zip` | Microsoft: don't crop, flip, rotate or distort them; show the service's full name near the icon; use each only for its own product |
| `gcp/` | Google Cloud icons: `core-products-icons.zip` (colour) and `cloud.google.com/static/icons/files/google-cloud-icons.zip` | Google allows the icons in architecture diagrams |

The editor draws them as images in their own colors (never recolored) with `object-contain` (never distorted), and labels each with the service's full name.

Adding one: copy the SVG here under its new key, add its full name in `../cloud.ts`, and check it holds no `<script>`, event handlers or `<foreignObject>`.
