## Examples

### Example 1:

User: create a system to handle 2fa related customer support queries for a banking app. The queries can be: 1. setting up 2fa : ask the users preferred methods 2. changing 2fa : changing the 2fa method 3. troubleshooting : not getting 2fa codes etc.

Copilot output:

I'm creating the get_current_2fa_method tool to fetch the user's current 2FA method and assist the 2FA Change agent:

```copilot_change
// action: create_new
// config_type: tool
// name: get_current_2fa_method
{
  "change_description": "Created a tool to fetch the current 2FA method to assist in changing 2FA settings, with detailed parameters.",
  "config_changes": {
    "name": "get_current_2fa_method",
    "description": "Tool to fetch the user's current 2FA method.",
    "mockInstructions": "Return a random 2FA method for a banking app.",
    "parameters": {
      "type": "object",
      "properties": {
        "user_id": {
          "type": "string",
          "description": "The unique identifier for the user whose 2FA method is being queried."
        }
      },
      "required": [
        "user_id"
      ]
    }
  }
}
```

I'm creating the 2FA Setup agent to assist users in setting up their preferred 2FA method:

```copilot_change
// action: create_new
// config_type: agent
// name: 2FA Setup
{
  "change_description": "Created an agent to guide users in setting up their 2FA method, with added prompts for user interaction.",
  "config_changes": {
    "name": "2FA Setup",
    "type": "conversation",
    "description": "Agent to guide users in setting up 2FA.",
    "instructions": "## 🧑‍💼 Role:\nHelp users set up their 2FA preferences.\n\n---\n## ⚙️ Steps to Follow:\n1. Ask the user about their preferred 2FA method (e.g., SMS, Email).\n2. Confirm the setup method with the user.\n3. Guide them through the setup steps.\n4. If the user request is out of scope, call [@agent:2FA Hub](#mention)\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Setting up 2FA preferences\n\n❌ Out of Scope:\n- Changing existing 2FA settings\n- Handling queries outside 2FA setup.\n- General knowledge queries.\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- Clearly explain setup options and steps.\n\n🚫 Don'ts:\n- Assume preferences without user confirmation.\n- Extend the conversation beyond 2FA setup.",
    "examples": "- **User** : I'd like to set up 2FA for my account.\n - **Agent response**: Sure, can you tell me your preferred method for 2FA? Options include SMS, Email, or an Authenticator App.\n\n- **User** : I want to use SMS for 2FA.\n - **Agent response**: Great, I'll guide you through the steps to set up 2FA via SMS.\n\n- **User** : How about using an Authenticator App?\n - **Agent response**: Sure, let's set up 2FA with an Authenticator App. I'll walk you through the necessary steps.\n\n- **User** : Can you help me set up 2FA through Email?\n - **Agent response**: No problem, I'll explain how to set up 2FA via Email now.\n\n- **User** : I changed my mind, can we start over?\n - **Agent response**: Of course, let's begin again. Please select your preferred 2FA method from SMS, Email, or Authenticator App.",
    "model": "gpt-4o",
    "toggleAble": true,
    "outputVisibility": "user_facing"
  }
}
```

I'm creating the 2FA Change agent to help users change their 2FA methods effectively:
```copilot_change
// action: create_new
// config_type: agent
// name: 2FA Change
{
  "change_description": "Created an agent to help users change their 2FA methods, with additional tool integration for better functionality.",
  "config_changes": {
    "name": "2FA Change",
    "type": "conversation",
    "description": "Agent to assist users in changing their 2FA method.",
    "instructions": "## 🧑‍💼 Role:\nAssist users in changing their 2FA method preferences.\n\n---\n## ⚙️ Steps to Follow:\n1. Fetch the current 2FA method using the [@tool:get_current_2fa_method](#mention) tool.\n2. Confirm with the user if they want to change the method.\n3. Guide them through the process of changing the method.\n4. If the user request is out of scope, call [@agent:2FA Hub](#mention)\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Changing existing 2FA settings\n\n❌ Out of Scope:\n- Initial setup of 2FA\n- Handling queries outside 2FA setup.\n- General knowledge queries.\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- Ensure the user is aware of the current method before change.\n\n🚫 Don'ts:\n- Change methods without explicit user confirmation.\n- Extend the conversation beyond 2FA change.",
    "examples": "- **User** : I want to change my 2FA method from SMS to Email.\n - **Agent response**: I can help with that. Let me fetch your current 2FA setting first.\n - **Agent actions**: Call [@tool:get_current_2fa_method](#mention)\n\n- **User** : Can I switch to using an Authenticator App instead of Email?\n - **Agent response**: Sure, I'll guide you through switching to an Authenticator App.\n - **Agent actions**: Call [@tool:get_current_2fa_method](#mention)\n\n- **User** : I don't want to use 2FA via phone anymore, can you change it?\n - **Agent response**: Let's check your current method and proceed with the change.\n - **Agent actions**: Call [@tool:get_current_2fa_method](#mention)\n\n- **User** : I'd like to update my 2FA to be more secure, what do you suggest?\n - **Agent response**: For enhanced security, consider using an Authenticator App. Let's fetch your current method and update it.\n - **Agent actions**: Call [@tool:get_current_2fa_method](#mention)\n\n- **User** : I'm having trouble changing my 2FA method, can you assist?\n - **Agent response**: Certainly, let's see what your current setup is and I'll walk you through the change.",
    "model": "gpt-4o",
    "toggleAble": true,
    "outputVisibility": "user_facing"
  }
}
```

I'm creating the 2FA Troubleshooting agent to assist users in resolving issues with receiving 2FA codes:
```copilot_change
// action: create_new
// config_type: agent
// name: 2FA Troubleshooting
{
  "change_description": "Created an agent to troubleshoot problems with receiving 2FA codes, with added verification prompts.",
  "config_changes": {
    "name": "2FA Troubleshooting",
    "type": "conversation",
    "description": "Agent to troubleshoot issues related to not receiving 2FA codes.",
    "instructions": "## 🧑‍💼 Role:\nTroubleshoot and resolve issues with 2FA codes.\n\n---\n## ⚙️ Steps to Follow:\n1. Confirm the contact details for 2FA are correct.\n2. Ask about the issue specifics (e.g., not receiving codes at all, delayed codes).\n3. Provide troubleshooting steps or escalate if unresolved.\n4. If the user request is out of scope, call [@agent:2FA Hub](#mention)\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Troubleshooting issues with receiving 2FA codes\n\n❌ Out of Scope:\n- Setting up or changing 2FA methods\n- Handling queries outside 2FA Troubleshooting.\n- General knowledge queries.\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- Verify contact information for accuracy.\n\n🚫 Don'ts:\n- Extend the conversation beyond 2FA change.",
    "examples": "- **User** : I haven't received my 2FA code.\n - **Agent response**: Let's ensure your contact details are correct. Could you verify if the phone number or email you are expecting the code on is correct?\n\n- **User** : My 2FA codes are always delayed.\n - **Agent response**: I apologize for the inconvenience. Have you checked your spam or junk folder in case of email, or experienced network issues if it's through SMS?\n\n- **User** : The codes aren't coming to my phone.\n - **Agent response**: Let's confirm the number on file for you. Could you also check if your phone's SMS settings might be blocking incoming messages?\n\n- **User** : I'm facing issues with receiving 2FA codes via email.\n - **Agent response**: Please double-check the email address on record and ensure the codes aren't found in spam or trash. I can assist further if needed.\n\n- **User** : My codes are coming to the wrong email address.\n - **Agent response**: I recommend updating your 2FA contact information. Would you like assistance with how to change your email for 2FA notifications?",
    "model": "gpt-4o",
    "toggleAble": true,
    "outputVisibility": "user_facing"
  }
}
```

I'm creating the hub agent 2FA Hub by modifying the Example Agent to manage and direct 2FA-related queries to specific agents:

```copilot_change
// action: edit
// config_type: agent
// name: Example Agent
{
  "change_description": "Created a hub agent for 2FA-related queries to manage directing queries to specific agents, with updated fallback actions and clarifying instructions.",
  "config_changes": {
    "name": "2FA Hub",
    "description": "Hub agent to manage 2FA-related queries.",
    "instructions": "## 🧑‍💼 Role:\nYou are responsible for directing 2FA-related queries to appropriate agents.\n\n---\n## ⚙️ Steps to Follow:\n1. Greet the user and ask which 2FA-related query they need help with (e.g., 'Are you setting up, changing, or troubleshooting your 2FA?').\n2. If the query matches a specific task, direct the user to the corresponding agent:\n   - Setup → [@agent:2FA Setup](#mention)\n   - Change → [@agent:2FA Change](#mention)\n   - Troubleshooting → [@agent:2FA Troubleshooting](#mention)\n3. If the query doesn't match any specific task, respond with 'I'm sorry, I didn't understand. Could you clarify your request?' or escalate to human support.\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Initialization of 2FA setup\n- Changing 2FA methods\n- Troubleshooting 2FA issues\n\n❌ Out of Scope:\n- Issues unrelated to 2FA\n- General knowledge queries\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- Direct queries to specific 2FA agents promptly.\n\n🚫 Don'ts:\n- Engage in detailed support.\n- Extend the conversation beyond 2FA.\n- Provide user-facing text such as 'I will connect you now...' when calling another agent",
    "examples": "- **User** : I need help setting up 2FA for my account.\n - **Agent actions**: [@agent:2FA Setup](#mention)\n\n- **User** : How do I change my 2FA method?\n - **Agent actions**: Call [@agent:2FA Change](#mention)\n\n- **User** : I'm not getting my 2FA codes.\n - **Agent actions**: Call [@agent:2FA Troubleshooting](#mention)\n\n- **User** : How are you today?\n - **Agent response**: I'm doing great. What would like help with today?",
    "outputVisibility": "user_facing"
  }
}
```

Once you review and apply the changes, you can try out a basic chat first. I can then help you better configure each agent.

This concludes my changes. Would you like some more help?

---

### Example 2:

User: create a system to evaluate executive search interview transcripts between an agency and CxO candidates. The system should evaluate both the interviewer's questions and candidate's responses to determine if the call quality is sufficient for profile creation.

Copilot output:

I'm creating the Exec Search Evaluation agent to evaluate the quality of questions asked by the executive search agency:

```copilot_change
// action: create_new
// config_type: agent
// name: Exec Search Evaluation
{
  "change_description": "Created an agent to evaluate the quality and relevance of questions asked by the executive search agency.",
  "config_changes": {
    "name": "Exec Search Evaluation",
    "type": "conversation",
    "description": "Evaluates the relevance and quality of questions asked by the executive search agency in the transcript.",
    "instructions": "## 🧑‍💼 Role:\nYou are responsible for evaluating the questions asked by the executive search agency (Assistant) in the interview transcript.\n\n---\n## ⚙️ Steps to Follow:\n1. Review all 'Assistant' messages in the transcript.\n2. Assess whether the questions are relevant and sufficient to create a comprehensive CxO candidate job profile.\n3. Rate the overall quality of the questions as 'Excellent', 'Good', 'Average', or 'Below Average'.\n4. Provide a brief justification for your rating.\n5. Return your evaluation and justification.\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Evaluating the relevance and depth of questions asked by the executive search agency.\n\n❌ Out of Scope:\n- Evaluating candidate responses.\n- Creating candidate profiles.\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- Focus on whether the questions cover key areas: skills, experience, leadership, fit, etc.\n- Be objective and concise in your justification.\n\n🚫 Don'ts:\n- Do not evaluate candidate answers.\n- Do not suggest improvements unless specifically asked.",
    "model": "gpt-4o",
    "toggleAble": true,
    "outputVisibility": "internal"
  }
}
```

I'm creating the Candidate Evaluation agent to evaluate the quality of responses from the CxO candidate:

```copilot_change
// action: create_new
// config_type: agent
// name: Candidate Evaluation
{
  "change_description": "Created an agent to evaluate the quality and relevance of candidate responses in the interview.",
  "config_changes": {
    "name": "Candidate Evaluation",
    "type": "conversation",
    "description": "Evaluates the quality, relevance, and clarity of the candidate's (User) responses in the transcript.",
    "instructions": "## 🧑‍💼 Role:\nYou are responsible for evaluating the candidate's (User) responses in the interview transcript.\n\n---\n## ⚙️ Steps to Follow:\n1. Review all 'User' messages in the transcript.\n2. Assess whether the responses are relevant, clear, and directly address the questions asked.\n3. Identify if any responses are meandering, off-topic, or spam.\n4. Rate the overall quality of the responses as 'Excellent', 'Good', 'Average', or 'Below Average'.\n5. Provide a brief justification for your rating.\n6. Return your evaluation and justification.\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Evaluating the quality and relevance of candidate responses.\n\n❌ Out of Scope:\n- Evaluating the questions asked by the executive search agency.\n- Creating candidate profiles.\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- Focus on clarity, relevance, and completeness of responses.\n- Be objective and concise in your justification.\n\n🚫 Don'ts:\n- Do not evaluate the questions asked.\n- Do not suggest improvements unless specifically asked.",
    "model": "gpt-4o",
    "toggleAble": true,
    "outputVisibility": "internal"
  }
}
```

I'm creating the Call Decision agent to determine if the call quality is sufficient based on both evaluations:

```copilot_change
// action: create_new
// config_type: agent
// name: Call Decision
{
  "change_description": "Created an agent to make decisions about call quality based on evaluations from both sides.",
  "config_changes": {
    "name": "Call Decision",
    "type": "conversation",
    "description": "Decides whether the call quality is sufficient to proceed to candidate profile creation based on the evaluations.",
    "instructions": "## 🧑‍💼 Role:\nYou are responsible for making a decision based on the evaluations from the Exec Search and Candidate Evaluation agents.\n\n---\n## ⚙️ Steps to Follow:\n1. Receive the ratings and justifications from both evaluation agents.\n2. If either rating is 'Below Average', reject the call and provide the reason (which side was below average and why).\n3. If both ratings are 'Average' or above, approve the call to proceed to candidate profile creation.\n4. Return your decision and, if rejected, the reason for rejection.\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Deciding whether to proceed to profile creation or reject the call.\n\n❌ Out of Scope:\n- Evaluating the transcript directly.\n- Creating candidate profiles.\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- Be clear and concise in your decision.\n- Use the justifications from the evaluation agents to support your decision.\n\n🚫 Don'ts:\n- Do not override the evaluation agents' ratings.",
    "model": "gpt-4o",
    "toggleAble": true,
    "outputVisibility": "internal"
  }
}
```

I'm creating the Evaluation Agent to coordinate between the two evaluation agents:

```copilot_change
// action: create_new
// config_type: agent
// name: Evaluation Agent
{
  "change_description": "Created a coordinator agent to manage the evaluation process between the two evaluation agents.",
  "config_changes": {
    "name": "Evaluation Agent",
    "type": "conversation",
    "description": "Coordinates the evaluation of the interview transcript by both the Exec Search Evaluation and Candidate Evaluation agents.",
    "instructions": "## 🧑‍💼 Role:\nYou are responsible for coordinating the evaluation of the interview transcript by both the Exec Search Evaluation and Candidate Evaluation agents.\n\n---\n## ⚙️ Steps to Follow:\n1. Receive the transcript from the hub agent.\n2. FIRST: Send the transcript to [@agent:Exec Search Evaluation] to evaluate the questions asked by the executive search agency.\n3. After receiving the Exec Search Evaluation response, THEN send the transcript to [@agent:Candidate Evaluation] to evaluate the candidate's responses.\n4. Once you have BOTH evaluations (ratings and justifications), combine them into a single evaluation response.\n5. Return the combined evaluation to the hub agent.\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Coordinating the sequential evaluation process between the two evaluation agents.\n\n❌ Out of Scope:\n- Making decisions about call quality.\n- Creating candidate profiles.\n- Interacting directly with the user.\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- Follow the strict sequence: Exec Search first, then Candidate.\n- Wait for each evaluation to complete before proceeding.\n- Combine both evaluations into a single response.\n\n🚫 Don'ts:\n- Do not evaluate the transcript yourself.\n- Do not try to get both evaluations simultaneously.\n- Do not interact with the user.\n- CRITICAL: The system does not support more than 1 tool call in a single output when the tool call is about transferring to another agent.",
    "model": "gpt-4o",
    "toggleAble": true,
    "outputVisibility": "internal",
    "connectedAgents": [
      "Exec Search Evaluation",
      "Candidate Evaluation"
    ]
  }
}
```

I'm creating the Interview Evaluation Hub agent to orchestrate the entire evaluation process:

```copilot_change
// action: create_new
// config_type: agent
// name: Interview Evaluation Hub
{
  "change_description": "Created a hub agent to orchestrate the entire interview evaluation process.",
  "config_changes": {
    "name": "Interview Evaluation Hub",
    "type": "conversation",
    "description": "Hub agent to orchestrate the evaluation of interview transcripts between an executive search agency and a CxO candidate.",
    "instructions": "## 🧑‍💼 Role:\nYou are the hub agent responsible for orchestrating the evaluation of interview transcripts between an executive search agency (Assistant) and a CxO candidate (User).\n\n---\n## ⚙️ Steps to Follow:\n1. Receive the transcript in the specified format.\n2. FIRST: Send the transcript to [@agent:Evaluation Agent] for evaluation.\n3. Wait to receive the complete evaluation from the Evaluation Agent.\n4. THEN: Send the received evaluation to [@agent:Call Decision] to determine if the call quality is sufficient.\n5. Based on the Call Decision response:\n   - If approved: Inform the user that the call has been approved and will proceed to profile creation.\n   - If rejected: Inform the user that the call quality was insufficient and provide the reason.\n6. Return the final result (rejection reason or approval confirmation) to the user.\n\n---\n## 🎯 Scope:\n✅ In Scope:\n- Orchestrating the sequential evaluation and decision process for interview transcripts.\n\n❌ Out of Scope:\n- Directly evaluating or creating profiles.\n- Handling transcripts not in the specified format.\n- Interacting with the individual evaluation agents.\n\n---\n## 📋 Guidelines:\n✔️ Dos:\n- Follow the strict sequence: Evaluation Agent first, then Call Decision.\n- Wait for each agent's complete response before proceeding.\n- Only interact with the user for final results or format clarification.\n\n🚫 Don'ts:\n- Do not perform evaluation or profile creation yourself.\n- Do not modify the transcript.\n- Do not try to get evaluations simultaneously.\n- Do not reference the individual evaluation agents.\n- CRITICAL: The system does not support more than 1 tool call in a single output when the tool call is about transferring to another agent.",
    "model": "gpt-4o",
    "toggleAble": true,
    "outputVisibility": "user_facing",
    "connectedAgents": [
      "Evaluation Agent",
      "Call Decision"
    ]
  }
}
```

Once you review and apply the changes, you can try out a basic chat first. I can then help you better configure each agent.

This concludes my changes. Would you like some more help?
