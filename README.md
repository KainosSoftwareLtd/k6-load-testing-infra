# K6 Performance Testing

This guide will walk you through K6 performance testing using a local Kubernetes cluster, InfluxDB for data storage, and Grafana for result visualization. The entire infrastructure is created as an Infrastructure as Code (IaC) using Helmfile.

## Prerequisites

Make sure you have the following tools installed:

- [Docker](https://docs.docker.com/get-docker/)
- [Kubectl](https://kubernetes.io/docs/tasks/tools/)
- [Minikube](https://minikube.sigs.k8s.io/docs/start/)
- [Helmfile](https://helmfile.readthedocs.io/en/latest/)

## Storing credentials for Kubernetes

FOR SIMPLICITY THIS BRANCH HAS NO ENCRYPTION !!!
Simply change credentials in [this file](./secrets/influxdb-secrets-decrypted.yaml). Example of correct token:

```yaml
influxdb_auth_token: 14FNL24BhYy2AD4an0YmYdhA7EdeQzTq8fETDSmR_53ilC998EGohu-efnfLrhMGN0ZzFusqTBTb5SIGRXLsCQ==
``` 
To secure the repo you could integrate it with AWS Secrets Manager or Azure KeyVault or sops. Resources
[[1]](https://helmfile.readthedocs.io/en/latest/remote-secrets/)
[[2]](https://fenyuk.medium.com/helm-for-kubernetes-handling-secrets-with-sops-d8149df6eda4)


## Building local kubernetes cluster

Start the Minikube cluster:

```bash
minikube start
```

You can encounter problems with pulling the image due to Kainos certificates, follow these steps to resolve the issue. You may need to add Kainos certificates to your Minikube setup. For more detailed information, refer to the [official Minikube documentation](https://minikube.sigs.k8s.io/docs/handbook/vpn_and_proxy/).


1. Download the appropriate certificates from the Kainos website [here](https://kainossoftwareltd.sharepoint.com/systems/Shared%20Documents/Forms/AllItems.aspx?id=%2Fsystems%2FShared%20Documents%2FSystems%20%2D%20Help%2FZscaler%20Docker%20Resources%2FDocker%2DZscaler%2DFixes%2Frunning%2Dcontainer%2Fcerts&viewid=27724728%2D4394%2D4668%2Dbfe4%2D1ba3b33b04f0).

2. Once you've downloaded the certificates, copy and paste them into the following path on your system: `~/.minikube/certs`.

## (Alernative) build the eks cluster

To be able to run the infrastructure on eks cluster you need to have an eks cluster :). There are [plenty of tutorials](https://docs.aws.amazon.com/eks/latest/userguide/getting-started.html) that provide detailed explanation on how to do that.

Another step is to [install AWS Load Balancer](https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html) add-on to your cluster. This step is required to be able to reach applications in your cluster through ingress.

## Start infrastructure on the cluster

This part requires only the following steps:

```bash
helmfile repos
helmfile sync
```

This part may take a couple of minutes to start. You can verify the status of pods. They should all be ready and running:

```bash
kubectl get pod # influxdb and namegenerator pod
kubectl get pod -n monitoring # grafana pod
kubectl get pod -n k6-operator-system # k6-operator pod
```

### Reaching grafana on minikube local cluster

To port forward the Grafana pod, open a new terminal window and use the following command to make it available at https://localhost:3000/. You can log in with the default account:

- username: admin
- password: admin

```bash
kubectl port-forward -n monitoring deployment/grafana 3000:3000
```

### Reaching grafana on eks cluster
One of the ways to reach pods running on eks cluster is to create ingress resource. In the case of our infrastructure this can be achieved using following definition:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: monitoring
  name: ingress-grafana
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
        - path: /
          pathType: Prefix
          backend:
            service:
              name: grafana
              port:
                number: 3000
```

```bash
kubectl apply -f <path to ingress definition>
```

To obtain the address pointing to your cluster use:

```bash
kubectl get ingress -n monitoring
```
and use address from the response in your browser. You can login using:
- username: admin
- password: admin

## Run tests

The final step is to run the tests. To do this, we need to create a [k6 JavaScript test](https://k6.io/docs/testing-guides/api-load-testing/). We'll walk through the process using a test.js file that simply sends a request to the namegenerator app and checks for a status of 200. To run this test, we need to save it in a configmap that is accessible to our pods. You can achieve this with the following command:

```bash
kubectl create configmap name-generator-stress-test --from-file ./test-resources/test.js
```

This command creates a configmap named "name-generator-stress-test" based on the "test.js" file.

Now we need to create custom resource. According to [official documentaion](https://k6.io/docs/testing-guides/running-distributed-tests/): <i>The data we provide in the custom resource TestRun object should contain all the information necessary for the k6-operator to start a distributed load test</i>

We create TestRun object by using: 

```bash
kubectl apply -f .test-resources/custom-resource.yaml
```

K6 operator that is already deployed on a cluster will react by modifying the cluster state, spinning up k6 test jobs as needed. We should see test results appear in grafana provisioned dashboard named <b>k6 test results</b>. 

### Detailed explanation of custom resource file

Keep in mind that there are some caveats with the custom resource file. In our specific case, to utilize InfluxDB v2, we had to create our custom K6 container image for the test jobs. The default K6 operator uses the grafana/k6:latest image. There are many more extensions [available](https://k6.io/docs/extensions/get-started/explore/). Below is a dockerfile code sample that demonstrates how to create k6 custom image with inlufxdb v2 extension ([more info](https://github.com/grafana/k6-operator#using-extensions)).

```dockerfile
# Build the k6 binary with the extension
FROM golang:1.20 as builder

RUN go install go.k6.io/xk6/cmd/xk6@latest
# For our example, we'll add support for output of test metrics to InfluxDB v2.
# Feel free to add other extensions using the '--with ...'.
RUN xk6 build \
    --with github.com/grafana/xk6-output-influxdb@latest \
    --output /k6

# Use the operator's base image and override the k6 binary
FROM grafana/k6:latest
COPY --from=builder /k6 /usr/bin/k6
```

and runnning 

```bash
docker build -t k6-extended:local .
```

The final step is to make this image available to our cluster. One approach to accomplish this is to publish it to Docker Hub and then use it in the custom resource file with the appropriate environment variables set:

```yaml
# part of k6 custom resource file specifying image to run
  runner:
    image: kacperbober2/k6-extended-influxdb:latest
    env:
      - name: K6_OUT
        value: xk6-influxdb=<influxdb_cluster_address>
        value: <organization_name>
      - name: K6_INFLUXDB_ORGANIZATION
      - name: K6_INFLUXDB_BUCKET
        value: <bucket_name>
      - name: K6_INFLUXDB_TOKEN
        valueFrom:
          secretKeyRef:
            name: influxdb-secrets
            key: influxdb_token
```

In addition, you need to reference the config map that contains the test file, specify the parameter for generating parallel pods, and assign a unique identifier to the test run. For a detailed explanation of this process, you can find more information in the [documentation](https://k6.io/docs/testing-guides/running-distributed-tests/).

```yaml
# part of k6 custom resource file specifying test to run and configuration
spec:
  parallelism: 4
  script:
    configMap:
      name: name-generator-stress-test
      file: test.js
  arguments:  --tag testid=mytestid
```

server:
  persistentVolume:
    enabled: false