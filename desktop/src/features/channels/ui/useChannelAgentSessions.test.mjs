import assert from "node:assert/strict";
import test from "node:test";

import { getChannelAgentSessionAgents } from "./useChannelAgentSessions.ts";

const OWNER = "a".repeat(64);
const AGENT = "b".repeat(64);
const OTHER_AGENT = "c".repeat(64);
const ROOM_ID = "11111111-1111-4111-8111-111111111111";
const DM_ID = "22222222-2222-4222-8222-222222222222";

function makeChannel(overrides = {}) {
  return {
    id: ROOM_ID,
    name: "ops",
    channelType: "stream",
    visibility: "private",
    description: "",
    topic: null,
    purpose: null,
    memberCount: 2,
    memberPubkeys: [OWNER, AGENT],
    lastMessageAt: null,
    archivedAt: null,
    participants: [],
    participantPubkeys: [],
    isMember: true,
    ttlSeconds: null,
    ttlDeadline: null,
    ...overrides,
  };
}

function makeDm(overrides = {}) {
  return makeChannel({
    id: DM_ID,
    name: "",
    channelType: "dm",
    participants: ["Owner", "Agent"],
    participantPubkeys: [OWNER, AGENT],
    ...overrides,
  });
}

function member(pubkey, role) {
  return {
    pubkey,
    role,
    isAgent: role === "bot",
    joinedAt: "2026-08-01T00:00:00Z",
    displayName: null,
  };
}

function relayAgent(overrides = {}) {
  return {
    pubkey: AGENT,
    name: "ops-agent",
    status: "deployed",
    agentSource: "relay",
    canInterruptTurn: false,
    channelIds: [ROOM_ID],
    channels: [],
    ...overrides,
  };
}

test("relay agent stays scoped to its declared bot-role channel in rooms", () => {
  const agents = getChannelAgentSessionAgents({
    activeChannel: makeChannel(),
    activeChannelId: ROOM_ID,
    agents: [relayAgent()],
    channelMembers: [member(OWNER, "owner"), member(AGENT, "bot")],
  });

  assert.deepEqual(
    agents.map((agent) => agent.pubkey),
    [AGENT],
  );
});

test("relay agent with declared scope is excluded from undeclared rooms", () => {
  const otherRoom = makeChannel({
    id: "33333333-3333-4333-8333-333333333333",
    name: "elsewhere",
  });
  const agents = getChannelAgentSessionAgents({
    activeChannel: otherRoom,
    activeChannelId: otherRoom.id,
    agents: [relayAgent()],
    channelMembers: [member(OWNER, "owner"), member(AGENT, "member")],
  });

  assert.deepEqual(agents, []);
});

// DM rosters cannot carry the bot role — the relay hardcodes DM participants
// to `member` and no DM member is elevated enough to change a role — so an
// agent's declared bot-role channel scope must not exclude it from a DM it
// participates in. Without this, the agent's live observer activity hides
// behind the human typing row in every DM.
test("relay agent with declared scope is included in a DM it participates in", () => {
  const agents = getChannelAgentSessionAgents({
    activeChannel: makeDm(),
    activeChannelId: DM_ID,
    agents: [relayAgent()],
    channelMembers: [member(OWNER, "member"), member(AGENT, "member")],
  });

  assert.deepEqual(
    agents.map((agent) => agent.pubkey),
    [AGENT],
  );
});

test("relay agent outside the DM roster stays excluded", () => {
  const agents = getChannelAgentSessionAgents({
    activeChannel: makeDm(),
    activeChannelId: DM_ID,
    agents: [relayAgent({ pubkey: OTHER_AGENT, name: "other-agent" })],
    channelMembers: [member(OWNER, "member"), member(AGENT, "member")],
  });

  assert.deepEqual(agents, []);
});

test("DM inclusion falls back to participant pubkeys before members load", () => {
  const agents = getChannelAgentSessionAgents({
    activeChannel: makeDm(),
    activeChannelId: DM_ID,
    agents: [
      relayAgent(),
      relayAgent({ pubkey: OTHER_AGENT, name: "other-agent" }),
    ],
    channelMembers: undefined,
  });

  assert.deepEqual(
    agents.map((agent) => agent.pubkey),
    [AGENT],
  );
});

test("loaded DM members are authoritative over stale participant pubkeys", () => {
  const agents = getChannelAgentSessionAgents({
    activeChannel: makeDm({ participantPubkeys: [OWNER, OTHER_AGENT] }),
    activeChannelId: DM_ID,
    agents: [relayAgent()],
    channelMembers: [member(OWNER, "member"), member(AGENT, "member")],
  });

  assert.deepEqual(
    agents.map((agent) => agent.pubkey),
    [AGENT],
  );
});
