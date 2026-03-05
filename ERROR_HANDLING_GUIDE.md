# Error Handling & Edge Case Behavior Guide

## Overview
This document explains the error handling, validation, and default behavior added to handle edge cases gracefully.

---

## 🔴 Critical Edge Cases Fixed

### 1. Missing LLM Provider Configuration

#### **Scenario 1: User Creates Discussion Without Configuring Provider**

**Location:** `backend/app/tasks/discussion.py` (Lines 70-87)

**Old Behavior (DANGEROUS):**
```python
# Silently fell back to Ollama
provider = p.get("llm_providers") or {}
participant_llm_configs[p["id"]] = {
    "base_url": provider.get("base_url", "http://localhost:11434"),  # ❌ Silent fallback
    "api_key": provider.get("api_key", "ollama"),                    # ❌ Silent fallback
}
# Would fail later with: "Connection refused to localhost:11434"
```

**New Behavior (SAFE):**
```python
provider = p.get("llm_providers")
if not provider:
    logger.error(f"Participant {p['name']} ({p['id']}) has no LLM provider configured")
    raise ValueError(f"Participant '{p['name']}' is missing LLM provider configuration")

participant_llm_configs[p["id"]] = {
    "base_url": provider.get("base_url"),
    "api_key": provider.get("api_key"),
    "model": p.get("model_name", "gpt-3.5-turbo"),
    "max_tokens": p.get("max_tokens", 2048),
}

# Validate required fields
if not participant_llm_configs[p["id"]]["base_url"]:
    raise ValueError(f"Participant '{p['name']}' LLM provider is missing base_url")
if not participant_llm_configs[p["id"]]["api_key"]:
    raise ValueError(f"Participant '{p['name']}' LLM provider is missing api_key")
```

**User Experience:**
- ✅ **Clear Error**: "Participant 'Research Assistant' is missing LLM provider configuration"
- ✅ **Immediate Failure**: Fails at discussion start, not during execution
- ✅ **Actionable**: User knows to go to Settings and configure provider

---

#### **Scenario 2: Provider Configured But Missing Credentials**

**Location:** `backend/app/agents/context.py` (Lines 41-57)

**Old Behavior:**
```python
# Would try to connect to localhost:11434 or crash with KeyError
return ChatOpenAI(
    base_url=config.get("base_url", "http://localhost:11434"),
    api_key=config.get("api_key", "ollama"),
)
```

**New Behavior:**
```python
if participant_id and participant_configs and participant_id in participant_configs:
    config = participant_configs[participant_id]
    base_url = config.get("base_url")
    api_key = config.get("api_key")

    if not base_url or not api_key:
        raise ValueError(
            f"Participant {participant_id} has incomplete LLM configuration. "
            "Please ensure the LLM provider has base_url and api_key configured."
        )

    return ChatOpenAI(
        base_url=base_url,
        api_key=api_key,
        model=config.get("model", "gpt-3.5-turbo"),
        max_tokens=config.get("max_tokens", 2048),
        temperature=0.7,
    )
```

**User Experience:**
- ✅ **Clear Error**: "Participant X has incomplete LLM configuration"
- ✅ **Specific**: Tells you exactly what's missing (base_url or api_key)
- ✅ **Where to Fix**: "Please ensure the LLM provider has base_url and api_key configured"

---

#### **Scenario 3: No Global LLM Fallback Available**

**Location:** `backend/app/agents/context.py` (Lines 59-75)

**Old Behavior:**
```python
# Last resort: connect to non-existent Ollama
return ChatOpenAI(
    base_url="http://localhost:11434",
    api_key="ollama",
    model="default-model",
)
```

**New Behavior:**
```python
# Fallback to global config if provided
if llm_config and llm_config.get("base_url") and llm_config.get("api_key"):
    return ChatOpenAI(
        base_url=llm_config["base_url"],
        api_key=llm_config["api_key"],
        model=llm_config.get("model", "gpt-3.5-turbo"),
        max_tokens=llm_config.get("max_tokens", 2048),
        temperature=0.7,
    )

# No valid configuration available
raise ValueError(
    "No LLM provider configuration available. Please add an LLM provider in Settings, "
    "and ensure discussion participants are configured with a provider."
)
```

**User Experience:**
- ✅ **Explicit Error**: No silent failures
- ✅ **Actionable**: "Please add an LLM provider in Settings"
- ✅ **Guided**: User knows exactly where to go fix it

---

### 2. Missing Database Fields

#### **Scenario 4: Database Returns Incomplete Participant Data**

**Location:** `backend/app/tasks/discussion.py` (Lines 74-75)

**Old Behavior (CRASH):**
```python
participant_llm_configs[p["id"]] = {
    "model": p["model_name"],      # ❌ KeyError if missing!
    "max_tokens": p["max_tokens"],  # ❌ KeyError if missing!
}
```

**New Behavior (SAFE):**
```python
participant_llm_configs[p["id"]] = {
    "model": p.get("model_name", "gpt-3.5-turbo"),  # ✅ Safe with default
    "max_tokens": p.get("max_tokens", 2048),         # ✅ Safe with default
}
```

**User Experience:**
- ✅ **No Crash**: Uses sensible defaults
- ✅ **Continues**: Discussion can still run
- ✅ **Default Model**: Falls back to gpt-3.5-turbo (widely compatible)

---

### 3. WebSocket Connection Failures

#### **Scenario 5: Redis Connection Fails During WebSocket Subscribe**

**Location:** `backend/app/services/websocket_manager.py` (Lines 96-125)

**Old Behavior (CRASH):**
```python
async def subscribe_and_forward():
    try:
        redis = await self.get_redis()
        pubsub = redis.pubsub()  # Line 99
        channel = f"discussion:{discussion_id}"
        # ...
    finally:
        if pubsub:  # ❌ NameError if line 98 fails!
            await pubsub.unsubscribe(channel)  # ❌ NameError!
```

**New Behavior (SAFE):**
```python
async def subscribe_and_forward():
    pubsub = None  # ✅ Initialize before try
    channel = f"discussion:{discussion_id}"  # ✅ Safe to use in finally

    try:
        redis = await self.get_redis()
        pubsub = redis.pubsub()

        await pubsub.subscribe(channel)
        logger.info(f"Subscribed to Redis channel: {channel}")
        # ...
    except asyncio.CancelledError:
        logger.info(f"Subscription cancelled for: {discussion_id}")
    except Exception as e:
        logger.error(f"Redis subscription error for {discussion_id}: {e}")
    finally:
        if pubsub:  # ✅ Safe - always defined
            await pubsub.unsubscribe(channel)
            await pubsub.close()
```

**User Experience:**
- ✅ **No Crash**: Cleanup always works
- ✅ **Logged**: Error messages show what went wrong
- ✅ **Graceful**: WebSocket disconnects cleanly

---

### 4. JSON Parsing from LLM Responses

#### **Scenario 6: LLM Returns Malformed or Nested JSON**

**Location:** `backend/app/agents/nodes.py` (Lines 305-339)

**Old Behavior (BRITTLE):**
```python
# Naive string search - breaks with nested braces
content = response.content
start = content.find('{')
end = content.rfind('}') + 1
if start >= 0 and end > start:
    eval_data = json.loads(content[start:end])  # ❌ Parses wrong JSON if nested!
```

**Example Problem:**
```
LLM Response: "Here's my analysis: {outer: {scores: {...}, inner: {...}}} Thanks!"
Old code would extract: "{outer: {scores: {...}, inner: {...}}"
This would fail to parse because it's not the right JSON block.
```

**New Behavior (ROBUST):**
```python
content = response.content
eval_data = None

# Strategy 1: Parse entire content as JSON
try:
    eval_data = json.loads(content)
except json.JSONDecodeError:
    # Strategy 2: Find JSON block with proper brace matching
    brace_count = 0
    start_idx = content.find('{')
    if start_idx >= 0:
        for i in range(start_idx, len(content)):
            if content[i] == '{':
                brace_count += 1
            elif content[i] == '}':
                brace_count -= 1
                if brace_count == 0:  # Found matching closing brace
                    try:
                        eval_data = json.loads(content[start_idx:i+1])
                        break
                    except json.JSONDecodeError:
                        continue  # Try next JSON block

if eval_data:
    # Use parsed data
else:
    # Fallback to default scores
```

**User Experience:**
- ✅ **Multiple Strategies**: Tries whole content first, then extracts
- ✅ **Proper Brace Matching**: Correctly handles nested JSON
- ✅ **Graceful Fallback**: Default scores if parsing fails
- ✅ **No Data Loss**: LLM text still saved in reasoning field

---

### 5. Default LLM Fallback Warning

#### **Scenario 7: Discussion Has No Default Provider**

**Location:** `backend/app/tasks/discussion.py` (Lines 221-235)

**Old Behavior:**
```python
# Silent fallback to Ollama
llm_config = {
    "base_url": "http://localhost:11434",
    "api_key": "ollama",
    "model": "default-model",
}
```

**New Behavior:**
```python
if not llm_provider:
    logger.warning(f"Discussion {discussion_id} has no default LLM provider - participant-specific configs will be used")
    # Use minimal fallback - discussions should use per-participant configs
    llm_config = {
        "base_url": "",
        "api_key": "",
        "model": "gpt-3.5-turbo",
        "max_tokens": 2048,
    }
else:
    llm_config = {
        "base_url": llm_provider.get("base_url", ""),
        "api_key": llm_provider.get("api_key", ""),
        "model": llm_provider.get("model_name", "gpt-3.5-turbo"),
        "max_tokens": llm_provider.get("max_tokens", 2048),
    }
```

**User Experience:**
- ✅ **Logged Warning**: Admin knows discussion has no default provider
- ✅ **Still Works**: Participant-specific configs are used
- ✅ **Empty Credentials**: Forces use of participant providers
- ✅ **Expected Behavior**: Per-participant model selection is the design

---

## 📊 Error Message Hierarchy

### Level 1: Configuration Errors (Fail Fast)
**When:** At discussion start
**Examples:**
- "Participant 'X' is missing LLM provider configuration"
- "Participant 'X' LLM provider is missing base_url"
- "No LLM provider configuration available"

**Why:** User needs to configure before running

---

### Level 2: Runtime Warnings (Continue with Defaults)
**When:** During execution
**Examples:**
- "Discussion X has no default LLM provider - participant-specific configs will be used"
- "Failed to send message to websocket for user Y: Connection closed"

**Why:** Non-critical issues that don't stop execution

---

### Level 3: Data Fallbacks (Silent with Logging)
**When:** Missing optional fields
**Examples:**
- `model_name` missing → Falls back to "gpt-3.5-turbo"
- `max_tokens` missing → Falls back to 2048
- JSON parsing fails → Falls back to default evaluation scores

**Why:** Reasonable defaults exist

---

## 🎯 Design Philosophy

### 1. **Fail Fast on Configuration Issues**
```python
# ❌ DON'T: Silent fallbacks that fail later
config = get_config() or {"url": "http://localhost:11434"}  # Bad

# ✅ DO: Explicit validation at startup
config = get_config()
if not config or not config.get("url"):
    raise ValueError("Configuration missing! Please configure in Settings.")
```

### 2. **Graceful Degradation for Runtime Issues**
```python
# ❌ DON'T: Crash on non-critical errors
await websocket.send(message)  # Crashes if disconnected

# ✅ DO: Log and continue
try:
    await websocket.send(message)
except Exception as e:
    logger.warning(f"Failed to send message: {e}")
    # Connection will be cleaned up elsewhere
```

### 3. **Helpful Error Messages**
```python
# ❌ DON'T: Cryptic errors
raise ValueError("Invalid config")

# ✅ DO: Actionable guidance
raise ValueError(
    "Participant 'Research Assistant' is missing LLM provider configuration. "
    "Please add an LLM provider in Settings, and ensure the participant has a provider selected."
)
```

---

## 🔍 Complete Error Flow Example

### User Journey: Creating First Discussion

#### Step 1: User Creates Discussion (No Providers Configured)
```
User Action: Creates discussion "AI Ethics Discussion"
            Adds participant "Ethicist" (no provider selected)
            Clicks "Start Discussion"

System Response:
  ✅ Discussion created successfully (status: draft)
  ✅ Participant added to discussion
  ❌ Start fails with clear error:

  "Participant 'Ethicist' is missing LLM provider configuration.
   Please add an LLM provider in Settings, and ensure the participant has a provider selected."
```

#### Step 2: User Adds Provider But Missing API Key
```
User Action: Goes to Settings → LLM Providers
            Adds "OpenAI"
            Base URL: "https://api.openai.com/v1"
            API Key: [left empty]
            Saves

System Response:
  ⚠️  Provider saved (allows partial configuration)

User Action: Edits participant "Ethicist"
            Selects provider "OpenAI"
            Model: "gpt-4"
            Clicks "Start Discussion"

System Response:
  ❌ Start fails with validation error:

  "Participant 'Ethicist' LLM provider is missing api_key.
   Please ensure the LLM provider has base_url and api_key configured."
```

#### Step 3: User Completes Configuration
```
User Action: Edits provider "OpenAI"
            Adds API Key: "sk-..."
            Saves
            Clicks "Start Discussion"

System Response:
  ✅ Discussion starts successfully
  ✅ Messages begin appearing
  ✅ Real-time updates via WebSocket
```

---

## 📝 Summary: What Changed

| Edge Case | Old Behavior | New Behavior |
|-----------|-------------|--------------|
| No LLM provider | Silent fail → "Connection refused" | Explicit error with guidance |
| Missing credentials | Try localhost:11434 | Validation error with fix instructions |
| Missing DB fields | KeyError crash | Safe defaults with .get() |
| WebSocket error | NameError in cleanup | Safe cleanup, logged errors |
| Bad JSON from LLM | Parse wrong block | Multiple strategies + fallback |
| No default provider | Use Ollama | Log warning, use participant configs |

**Result:** System is now **fail-safe** with **actionable error messages** that guide users to fix configuration issues.
