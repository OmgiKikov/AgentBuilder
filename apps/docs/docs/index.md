---
title: AgentBuilder Documentation
---

# Welcome to AgentBuilder

- Read the [quickstart guide](quickstart.md)
- Check out the [API reference](api-reference.md)

# Welcome to AgentBuilder

AgentBuilder is a low-code AI IDE to build MCP tools connected multi-agent assistants. AgentBuilder copilot builds the agents for you based on your requirements with the option do everything manually as well.

**Note:** These docs are intended for developers who would like to use our [open-source code](https://github.com/AgentBuilderlabs/AgentBuilder/).

- Our source code is on GitHub at [@AgentBuilderlabs/AgentBuilder](https://github.com/AgentBuilderlabs/AgentBuilder/)
- Email us at [founders@AgentBuilderlabs.com](mailto:founders@AgentBuilderlabs.com)
- Visit our [website](https://www.AgentBuilderlabs.com/)

## What is AgentBuilder?
**AgentBuilder is a state-of-art platform to build multi-agent AI systems in a visual interface, with the help of a copilot.**

AgentBuilder enables you to build, manage and deploy user-facing assistants. An assistant is made up of multiple agents, each having access to a set of tools and working together to interact with the user as a single assistant. You can connect any MCP tools to the agents.

For example, you can build a *credit card assistant*, where each agent handles a workflow such as *outstanding payments*, *balance inquiries* and *transaction disputes*. You can equip agents with tools to carry out tasks such as *fetching payment options*, *checking outstanding balance* and *updating user information*. The assistant would help your end-users their credit card-related needs without having to talk to a human agent on your end.

## How AgentBuilder works

### AgentBuilder Studio
AgentBuilder Studio lets you create AI agents in minutes, using a visual interface and plain language. Here are key components that you will work with:

| Component  | Description | Highlights |
|------------|-------------|------------|
| Agent     | Handles a specific part of the conversation and<br>performs tasks using tools, based on instructions |• Configurable using plain language instructions<br>• Orchestrate between agents connected as a graph<br>• Can access tools and knowledge sources (RAG)|
| Playground | Interactive environment to test assistants<br>conversationally as you build them |• Real-time testing and debugging<br>• Inspect parameters and results of tool calls in-line<br>• Converse with individual agents or the entire assistant|
| Copilot    | AI-powered concierge that creates and<br>updates agents and tools on your behalf |• Context-aware of all components including playground<br>• Improves agents based on conversations and feedback <br>• Understands your requests in plain language|

### AgentBuilder Chat API & SDK
- [AgentBuilder Chat API](/using_the_api) is a stateless HTTP API to interface with the assistant created on AgentBuilder Studio. You can use the API to drive end-user facing conversations in your app or website.
- [AgentBuilder Chat SDK](/using_the_sdk) is a simple SDK (currently available in Python) which wraps the HTTP API under the hood. It offers both stateful and stateless (OpenAI-style) implementations.

### Steps
**AgentBuilder Studio:**

1. Describe the assistant you are looking to build, to **copilot**
2. Review and apply the **agents** (and tools) created by copilot
3. Configure **MCP servers** and **tools** and connect them to agents
4. Chat with your assistant in the **playground**
6. Deploy and use the HTTP API or Python SDK to integrate the agents into your system

## Why AgentBuilder?
AgentBuilder is the fastest way to build and deploy MCP connected multi-agents

1. **Build** complex assistants using plain language and a visual interface
2. **Integrate** tools and MCP servers in minutes
3. **Expedite** your multi-agent AI roadmap using battle-tested tooling

## Getting started

- To set up our open-source installation, see [Github Readme](https://github.com/AgentBuilderlabs/AgentBuilder)
- To sign up for our managed offering (beta), please email us at [founders@AgentBuilderlabs.com](mailto:founders@AgentBuilderlabs.com)