# Open Source Installation

- This is the developers guide to self-hosting the open-source version of AgentBuilder. To get started with the hosted app, please see [Using the Hosted App](/hosted_setup)
- Please see our [Introduction](/) page before referring to this guide.
- For direct installation steps, please head to the README of AgentBuilder's Github repo: [@AgentBuilderlabs/AgentBuilder](https://github.com/AgentBuilderlabs/AgentBuilder/). This page provides more context about the installation process and the different components involved.

## Overview

AgentBuilder's codebase has three main components:

| Component | Description |
|--------------|---------------|
| **Agents** | Python framework responsible for carrying out multi-agent conversations |
| **Copilot** | Python framework powering the copilot in AgentBuilder Studio |
| **AgentBuilder** | Frontend and backend services to power AgentBuilder Studio and Chat APIs |

These components are structured as separate services, each containerized with Docker. Running `docker-compose up --build` enables you to use the Studio in your browser, as well as stands up the APIs and SDK.

## Prerequisites
All of these prerequisites have open-source or free versions.

| Prerequisite | Description |
|--------------|---------------|
| **Docker** | Bundles and builds all services |
| **OpenAI API Key** | Agents and Copilot services are powered by OpenAI LLMs |
| **MongoDB** | Stores workflow versions, chats and RAG embeddings |

Refer to our [Github Readme for Prerequisites](https://github.com/AgentBuilderlabs/AgentBuilder/?tab=readme-ov-file#prerequisites) to set up prerequisites.

## Setting up

Refer to our [Github Readme for Local Development](https://github.com/AgentBuilderlabs/AgentBuilder/?tab=readme-ov-file#local-development-setup) to set up Studio, Chat API and SDK via `docker-compose`.