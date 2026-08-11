// Mirrors a presenter's screen-shared tab to the audience window, live. Both windows are
// same-origin tabs of this app, so WebRTC signaling travels over BroadcastChannel (no server),
// and because both peers are on the same machine, ICE resolves via local host candidates alone
// (no STUN/TURN needed).

export type MirrorRole = 'sender' | 'receiver'
export type MirrorMessage =
  | { role: MirrorRole; kind: 'offer'; payload: RTCSessionDescriptionInit }
  | { role: MirrorRole; kind: 'answer'; payload: RTCSessionDescriptionInit }
  | { role: MirrorRole; kind: 'ice'; payload: RTCIceCandidateInit }

export const MIRROR_CHANNEL_NAME = 'inkpdf-mirror'

export function isMirrorMessage(data: unknown): data is MirrorMessage {
  if (!data || typeof data !== 'object') return false
  const message = data as Record<string, unknown>
  return (
    (message.role === 'sender' || message.role === 'receiver')
    && (message.kind === 'offer' || message.kind === 'answer' || message.kind === 'ice')
    && typeof message.payload === 'object' && message.payload !== null
  )
}

export function isFromOtherRole(message: Pick<MirrorMessage, 'role'>, ownRole: MirrorRole): boolean {
  return message.role !== ownRole
}

export type MirrorHandle = { stop: () => void }

function applyRemoteDescriptionThenFlush(
  pc: RTCPeerConnection,
  description: RTCSessionDescriptionInit,
  pendingCandidates: RTCIceCandidateInit[],
): Promise<void> {
  return pc.setRemoteDescription(description).then(() => {
    const candidates = pendingCandidates.splice(0, pendingCandidates.length)
    return Promise.all(candidates.map((candidate) => pc.addIceCandidate(candidate).catch(() => {}))).then(() => undefined)
  })
}

export function startMirrorSender(stream: MediaStream): MirrorHandle {
  const channel = new BroadcastChannel(MIRROR_CHANNEL_NAME)
  const pc = new RTCPeerConnection()
  stream.getTracks().forEach((track) => pc.addTrack(track, stream))

  let remoteDescriptionSet = false
  const pendingCandidates: RTCIceCandidateInit[] = []

  const send = (message: MirrorMessage) => channel.postMessage(message)

  pc.onicecandidate = (event) => {
    if (event.candidate) send({ role: 'sender', kind: 'ice', payload: event.candidate.toJSON() })
  }

  channel.onmessage = (event) => {
    const message = event.data
    if (!isMirrorMessage(message) || !isFromOtherRole(message, 'sender')) return
    if (message.kind === 'answer') {
      void applyRemoteDescriptionThenFlush(pc, message.payload, pendingCandidates).then(() => { remoteDescriptionSet = true })
    } else if (message.kind === 'ice') {
      if (remoteDescriptionSet) void pc.addIceCandidate(message.payload).catch(() => {})
      else pendingCandidates.push(message.payload)
    }
  }

  void pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer).then(() => offer))
    .then((offer) => send({ role: 'sender', kind: 'offer', payload: offer }))

  return {
    stop: () => {
      channel.close()
      pc.close()
      stream.getTracks().forEach((track) => track.stop())
    },
  }
}

export function startMirrorReceiver(onStream: (stream: MediaStream) => void, onEnd: () => void): MirrorHandle {
  const channel = new BroadcastChannel(MIRROR_CHANNEL_NAME)
  let pc: RTCPeerConnection | null = null
  let remoteDescriptionSet = false
  let pendingCandidates: RTCIceCandidateInit[] = []
  let ended = false

  const send = (message: MirrorMessage) => channel.postMessage(message)

  const signalEnd = () => {
    if (ended) return
    ended = true
    onEnd()
  }

  channel.onmessage = (event) => {
    const message = event.data
    if (!isMirrorMessage(message) || !isFromOtherRole(message, 'receiver')) return
    if (message.kind === 'offer') {
      // A fresh offer means a new sharing session -- tear down any previous connection first.
      pc?.close()
      ended = false
      remoteDescriptionSet = false
      pendingCandidates = []
      const connection = new RTCPeerConnection()
      pc = connection
      connection.onicecandidate = (event) => { if (event.candidate) send({ role: 'receiver', kind: 'ice', payload: event.candidate.toJSON() }) }
      connection.ontrack = (event) => onStream(event.streams[0])
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === 'closed' || connection.connectionState === 'failed' || connection.connectionState === 'disconnected') signalEnd()
      }
      void applyRemoteDescriptionThenFlush(connection, message.payload, pendingCandidates)
        .then(() => { remoteDescriptionSet = true })
        .then(() => connection.createAnswer())
        .then((answer) => connection.setLocalDescription(answer).then(() => answer))
        .then((answer) => send({ role: 'receiver', kind: 'answer', payload: answer }))
    } else if (message.kind === 'ice') {
      if (!pc) return
      if (remoteDescriptionSet) void pc.addIceCandidate(message.payload).catch(() => {})
      else pendingCandidates.push(message.payload)
    }
  }

  return {
    stop: () => {
      channel.close()
      pc?.close()
      pc = null
    },
  }
}
