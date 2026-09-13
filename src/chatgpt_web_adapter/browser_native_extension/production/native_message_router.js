function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function createNativeMessageRouter(capabilities) {
  const {
    protocolVersion,
    postNativeResult,
    fallbackNativeMessage,
    tryBeginNativeRequest,
    endNativeRequest,
    releaseRuntimeTab,
    externalOperationAck,
    externalOperationStatus,
    externalOperationResult,
    externalOperationEvents,
    characterizationStart,
    characterizationStop,
    characterizationDump,
    characterizationClear,
    characterizationStatus,
    characterizationSessionId,
    runningSnapshot,
    observeTurn,
    ensureListSurface,
  } = capabilities;

  const post = (port, payload) => postNativeResult(port, {
    protocol: protocolVersion,
    ...payload,
  });

  return async function productionNativeMessageRouter(message, port) {
    if (message?.protocol !== protocolVersion) return;
    const requestId = message.request_id;

    if (message?.type === "release_runtime_tab") {
      if (typeof requestId !== "string" || !requestId) return;
      if (!tryBeginNativeRequest(requestId)) {
        post(port, {
          type: "release_runtime_tab_result",
          request_id: requestId,
          ok: false,
          error: "BROWSER_NATIVE_EXTENSION_BUSY",
        });
        return;
      }
      try {
        const result = await releaseRuntimeTab(message);
        post(port, { type: "release_runtime_tab_result", request_id: requestId, ok: true, ...result });
      } catch (error) {
        post(port, { type: "release_runtime_tab_result", request_id: requestId, ok: false, error: errorText(error) });
      } finally {
        endNativeRequest(requestId);
      }
      return;
    }

    if (message?.type === "external_operation_ack") {
      const reply = await externalOperationAck(message.operation_id, message.cursor);
      post(port, { type: "external_operation_ack_result", request_id: requestId, ...reply });
      return;
    }
    if (message?.type === "external_operation_status") {
      const reply = await externalOperationStatus(message.operation_id);
      post(port, { type: "external_operation_status_result", request_id: requestId, ...reply });
      return;
    }
    if (message?.type === "external_operation_result") {
      const reply = await externalOperationResult(message.operation_id);
      post(port, { type: "external_operation_result_result", request_id: requestId, ...reply });
      return;
    }
    if (message?.type === "external_operation_events") {
      const reply = await externalOperationEvents(message.operation_id, message.cursor ?? null, message.limit);
      post(port, { type: "external_operation_events_result", request_id: requestId, ...reply });
      return;
    }

    if (message?.type === "characterize") {
      let reply;
      if (message.action === "start") {
        reply = await characterizationStart(
          typeof message.session_id === "string" && message.session_id ? message.session_id : null,
          {
            conversation_ref: message.conversation_ref ?? null,
            attempt_id: message.attempt_id ?? null,
            turn_id: message.turn_id ?? null,
          },
        );
      } else if (message.action === "stop") {
        const requestedSession = typeof message.session_id === "string" && message.session_id
          ? message.session_id
          : null;
        if (requestedSession !== null && requestedSession !== characterizationSessionId()) {
          reply = { ok: false, error: "CHARACTERIZE_SESSION_MISMATCH" };
        } else {
          reply = await characterizationStop();
        }
      } else if (message.action === "dump") {
        reply = await characterizationDump();
      } else if (message.action === "clear") {
        reply = await characterizationClear();
      } else if (message.action === "status") {
        reply = characterizationStatus();
      } else {
        reply = { ok: false, error: "CHARACTERIZE_UNKNOWN_ACTION" };
      }
      post(port, { type: "characterize_result", request_id: requestId, ...reply });
      return;
    }

    if (message?.type === "running_snapshot") {
      let reply;
      try {
        reply = await runningSnapshot();
      } catch (error) {
        reply = { ok: false, error: errorText(error) };
      }
      post(port, { type: "running_snapshot_result", request_id: requestId, ...reply });
      return;
    }

    if (message?.type === "observe_turn" || message?.type === "observe_list_surface") {
      if (typeof requestId !== "string" || !requestId) return;
      try {
        const observation = message.type === "observe_turn"
          ? await observeTurn(message)
          : await ensureListSurface(message);
        post(port, {
          type: message.type === "observe_turn" ? "turn_observation_result" : "list_surface_result",
          request_id: requestId,
          ok: true,
          ...(message.type === "observe_turn" ? { observation } : observation),
        });
      } catch (error) {
        post(port, {
          type: message.type === "observe_turn" ? "turn_observation_result" : "list_surface_result",
          request_id: requestId,
          ok: false,
          error: errorText(error),
        });
      }
      return;
    }

    return fallbackNativeMessage(message, port);
  };
}
