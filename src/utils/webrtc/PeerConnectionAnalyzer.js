/**
 *
 * @copyright Copyright (c) 2020, Daniel Calviño Sánchez (danxuliu@gmail.com)
 *
 * @license GNU AGPL version 3 or any later version
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

import {
	STAT_VALUE_TYPE,
	AverageStatValue,
} from './AverageStatValue'

const CONNECTION_QUALITY = {
	UNKNOWN: 0,
	GOOD: 1,
	MEDIUM: 2,
	BAD: 3,
	VERY_BAD: 4,
	NO_TRANSMITTED_DATA: 5,
}

const PEER_DIRECTION = {
	SENDER: 0,
	RECEIVER: 1,
}

/**
 * TODO documentation
 */
function PeerConnectionAnalyzer() {
	this._packets = {
		'audio': new AverageStatValue(5, STAT_VALUE_TYPE.CUMULATIVE),
		'video': new AverageStatValue(5, STAT_VALUE_TYPE.CUMULATIVE),
	}
	this._packetsLost = {
		'audio': new AverageStatValue(5, STAT_VALUE_TYPE.CUMULATIVE),
		'video': new AverageStatValue(5, STAT_VALUE_TYPE.CUMULATIVE),
	}
	this._packetsLostRatio = {
		'audio': new AverageStatValue(5, STAT_VALUE_TYPE.RELATIVE),
		'video': new AverageStatValue(5, STAT_VALUE_TYPE.RELATIVE),
	}
	this._packetsPerSecond = {
		'audio': new AverageStatValue(5, STAT_VALUE_TYPE.RELATIVE),
		'video': new AverageStatValue(5, STAT_VALUE_TYPE.RELATIVE),
	}
	// Only the last relative value is used, but as it is a cumulative value the
	// previous one is needed as a base to calculate the last one.
	this._timestamps = {
		'audio': new AverageStatValue(2, STAT_VALUE_TYPE.CUMULATIVE),
		'video': new AverageStatValue(2, STAT_VALUE_TYPE.CUMULATIVE),
	}

	this._analysisEnabled = {
		'audio': true,
		'video': true,
	}

	this._handlers = []

	this._peerConnection = null
	this._peerDirection = null

	this._getStatsInterval = null

	this._handleIceConnectionStateChangedBound = this._handleIceConnectionStateChanged.bind(this)
	this._processStatsBound = this._processStats.bind(this)

	this._connectionQualityAudio = CONNECTION_QUALITY.UNKNOWN
	this._connectionQualityVideo = CONNECTION_QUALITY.UNKNOWN
}
PeerConnectionAnalyzer.prototype = {

	on: function(event, handler) {
		if (!this._handlers.hasOwnProperty(event)) {
			this._handlers[event] = [handler]
		} else {
			this._handlers[event].push(handler)
		}
	},

	off: function(event, handler) {
		const handlers = this._handlers[event]
		if (!handlers) {
			return
		}

		const index = handlers.indexOf(handler)
		if (index !== -1) {
			handlers.splice(index, 1)
		}
	},

	_trigger: function(event, args) {
		let handlers = this._handlers[event]
		if (!handlers) {
			return
		}

		args.unshift(this)

		handlers = handlers.slice(0)
		for (let i = 0; i < handlers.length; i++) {
			const handler = handlers[i]
			handler.apply(handler, args)
		}
	},

	getConnectionQualityAudio: function() {
		return this._connectionQualityAudio
	},

	getConnectionQualityVideo: function() {
		return this._connectionQualityVideo
	},

	_setConnectionQualityAudio: function(connectionQualityAudio) {
		if (this._connectionQualityAudio === connectionQualityAudio) {
			return
		}

		this._connectionQualityAudio = connectionQualityAudio
		this._trigger('change:connectionQualityAudio', [connectionQualityAudio])
	},

	_setConnectionQualityVideo: function(connectionQualityVideo) {
		if (this._connectionQualityVideo === connectionQualityVideo) {
			return
		}

		this._connectionQualityVideo = connectionQualityVideo
		this._trigger('change:connectionQualityVideo', [connectionQualityVideo])
	},

	setPeerConnection: function(peerConnection, peerDirection = null) {
		if (this._peerConnection) {
			this._peerConnection.removeEventListener('iceconnectionstatechange', this._handleIceConnectionStateChangedBound)
			this._stopGetStatsInterval()
		}

		this._peerConnection = peerConnection
		this._peerDirection = peerDirection

		if (this._peerConnection) {
			this._peerConnection.addEventListener('iceconnectionstatechange', this._handleIceConnectionStateChangedBound)
			this._handleIceConnectionStateChangedBound()
		}
	},

	setAnalysisEnabledAudio: function(analysisEnabledAudio) {
		this._analysisEnabled['audio'] = analysisEnabledAudio

		if (!analysisEnabledAudio) {
			this._setConnectionQualityAudio(CONNECTION_QUALITY.UNKNOWN)
		} else {
			this._packets['audio'].reset()
			this._packetsLost['audio'].reset()
			this._packetsLostRatio['audio'].reset()
			this._packetsPerSecond['audio'].reset()
			this._timestamps['audio'].reset()
		}
	},

	setAnalysisEnabledVideo: function(analysisEnabledVideo) {
		this._analysisEnabled['video'] = analysisEnabledVideo

		if (!analysisEnabledVideo) {
			this._setConnectionQualityVideo(CONNECTION_QUALITY.UNKNOWN)
		} else {
			this._packets['video'].reset()
			this._packetsLost['video'].reset()
			this._packetsLostRatio['video'].reset()
			this._packetsPerSecond['video'].reset()
			this._timestamps['video'].reset()
		}
	},

	_handleIceConnectionStateChanged: function() {
		// TODO probably place this documentation elsewhere
		// Even if the ICE connection state changes to "closed", when the peer
		// connection is closed "iceConnectionStateChange" is not called.
		// https://stackoverflow.com/questions/60088478/webrtc-peer-iceconnectionstatechange-and-connectionstatechange-dont-fire-closed/60089898#60089898
		// Therefore if a connection is closed a null peer has to be set in the
		// analyzer.
		if (!this._peerConnection || (this._peerConnection.iceConnectionState !== 'connected' && this._peerConnection.iceConnectionState !== 'completed' && this._peerConnection.iceConnectionState !== 'disconnected')) {
			this._setConnectionQualityAudio(CONNECTION_QUALITY.UNKNOWN)
			this._setConnectionQualityVideo(CONNECTION_QUALITY.UNKNOWN)

			this._stopGetStatsInterval()
			return
		}

		if (this._getStatsInterval) {
			// Already active, nothing to do.
			return
		}

		this._getStatsInterval = window.setInterval(() => {
			this._peerConnection.getStats().then(this._processStatsBound)
		}, 1000)
	},

	_stopGetStatsInterval: function() {
		window.clearInterval(this._getStatsInterval)
		this._getStatsInterval = null
	},

	_processStats: function(stats) {
		if (!this._peerConnection || (this._peerConnection.iceConnectionState !== 'connected' && this._peerConnection.iceConnectionState !== 'completed' && this._peerConnection.iceConnectionState !== 'disconnected')) {
			return
		}

		if (this._peerDirection === PEER_DIRECTION.SENDER) {
			this._processSenderStats(stats)
		} else if (this._peerDirection === PEER_DIRECTION.RECEIVER) {
			this._processReceiverStats(stats)
		}

		if (this._analysisEnabled['audio']) {
			this._setConnectionQualityAudio(this._calculateConnectionQualityAudio())
		}
		if (this._analysisEnabled['video']) {
			this._setConnectionQualityVideo(this._calculateConnectionQualityVideo())
		}
	},

	_processSenderStats: function(stats) {
		// Packets stats for a sender are checked from the point of view of the
		// receiver.
		const packetsReceived = {
			'audio': -1,
			'video': -1,
		}
		const packetsLost = {
			'audio': -1,
			'video': -1,
		}

		// If "packetsReceived" is not available (like in Chromium) use
		// "packetsSent" instead; in Firefox the value does not seem to always
		// match, but is quite close (specially once the call has been on-going
		// for a while).
		const packetsSent = {
			'audio': -1,
			'video': -1,
		}

		const timestampReceived = {
			'audio': -1,
			'video': -1,
		}
		const timestampSent = {
			'audio': -1,
			'video': -1,
		}

		for (const stat of stats.values()) {
			if (!this._analysisEnabled[stat.kind]) {
				continue
			}

			if (stat.type === 'outbound-rtp') {
				if ('packetsSent' in stat && 'kind' in stat) {
					packetsSent[stat.kind] = stat.packetsSent

					if ('timestamp' in stat && 'kind' in stat) {
						timestampSent[stat.kind] = stat.timestamp
					}
				}
			} else if (stat.type === 'remote-inbound-rtp') {
				if ('packetsReceived' in stat && 'kind' in stat) {
					packetsReceived[stat.kind] = stat.packetsReceived

					if ('timestamp' in stat && 'kind' in stat) {
						timestampReceived[stat.kind] = stat.timestamp
					}
				}
				if ('packetsLost' in stat && 'kind' in stat) {
					packetsLost[stat.kind] = stat.packetsLost
				}
			}
		}

		for (const kind of ['audio', 'video']) {
			if (packetsReceived[kind] < 0) {
				packetsReceived[kind] = packetsSent[kind]
				timestampReceived[kind] = timestampSent[kind]
			}

			// In some (strange) cases a newer stat may report a lower value
			// than a previous one (it seems to happen if the connection delay
			// is high; probably the browser assumes that a packet was lost but
			// later receives the acknowledgment). If that happens just keep the
			// previous value to prevent distorting the analysis with negative
			// ratios of lost packets.
			if (packetsLost[kind] >= 0 && packetsLost[kind] < this._packetsLost[kind].getLastRawValue()) {
				packetsLost[kind] = this._packetsLost[kind].getLastRawValue()
			}

			if (packetsReceived[kind] >= 0) {
				this._packets[kind].add(packetsReceived[kind])
			}
			if (packetsLost[kind] >= 0) {
				this._packetsLost[kind].add(packetsLost[kind])
			}
			if (packetsReceived[kind] >= 0 && packetsLost[kind] >= 0) {
				// The packet stats are cumulative values, so the isolated
				// values are got from the helper object.
				// If there were no transmitted packets in the last stats the
				// ratio is higher than 1 both to signal that and to force the
				// quality towards a very bad quality faster, but not
				// immediately.
				let packetsLostRatio = 1.5
				if (this._packets[kind].getLastRelativeValue() > 0) {
					packetsLostRatio = this._packetsLost[kind].getLastRelativeValue() / this._packets[kind].getLastRelativeValue()
				}
				this._packetsLostRatio[kind].add(packetsLostRatio)
			}
			if (timestampReceived[kind] >= 0) {
				this._timestamps[kind].add(timestampReceived[kind])
			}
			if (packetsReceived[kind] >= 0 && timestampReceived[kind] >= 0) {
				const elapsedSeconds = this._timestamps[kind].getLastRelativeValue() / 1000
				// The packet stats are cumulative values, so the isolated
				// values are got from the helper object.
				const packetsPerSecond = this._packets[kind].getLastRelativeValue() / elapsedSeconds
				this._packetsPerSecond[kind].add(packetsPerSecond)
			}
		}
	},

	_processReceiverStats: function(stats) {
		const packetsReceived = {
			'audio': -1,
			'video': -1,
		}
		const packetsLost = {
			'audio': -1,
			'video': -1,
		}

		const timestamp = {
			'audio': -1,
			'video': -1,
		}

		for (const stat of stats.values()) {
			if (!this._analysisEnabled[stat.kind]) {
				continue
			}

			if (stat.type === 'inbound-rtp') {
				if ('packetsReceived' in stat && 'kind' in stat) {
					packetsReceived[stat.kind] = stat.packetsReceived
				}
				if ('packetsLost' in stat && 'kind' in stat) {
					packetsLost[stat.kind] = stat.packetsLost
				}
				if ('timestamp' in stat && 'kind' in stat) {
					timestamp[stat.kind] = stat.timestamp
				}
			}
		}

		for (const kind of ['audio', 'video']) {
			// In some (strange) cases a newer stat may report a lower value
			// than a previous one (it seems to happen if the connection delay
			// is high; probably the browser assumes that a packet was lost but
			// later receives the acknowledgment). If that happens just keep the
			// previous value to prevent distorting the analysis with negative
			// ratios of lost packets.
			if (packetsLost[kind] >= 0 && packetsLost[kind] < this._packetsLost[kind].getLastRawValue()) {
				packetsLost[kind] = this._packetsLost[kind].getLastRawValue()
			}

			if (packetsReceived[kind] >= 0) {
				this._packets[kind].add(packetsReceived[kind])
			}
			if (packetsLost[kind] >= 0) {
				this._packetsLost[kind].add(packetsLost[kind])
			}
			if (packetsReceived[kind] >= 0 && packetsLost[kind] >= 0) {
				// The packet stats are cumulative values, so the isolated
				// values are got from the helper object.
				// If there were no transmitted packets in the last stats the
				// ratio is higher than 1 both to signal that and to force the
				// quality towards a very bad quality faster, but not
				// immediately.
				let packetsLostRatio = 1.5
				if (this._packets[kind].getLastRelativeValue() > 0) {
					packetsLostRatio = this._packetsLost[kind].getLastRelativeValue() / this._packets[kind].getLastRelativeValue()
				}
				this._packetsLostRatio[kind].add(packetsLostRatio)
			}
			if (timestamp[kind] >= 0) {
				this._timestamps[kind].add(timestamp[kind])
			}
			if (packetsReceived[kind] >= 0 && timestamp[kind] >= 0) {
				const elapsedSeconds = this._timestamps[kind].getLastRelativeValue() / 1000
				// The packet stats are cumulative values, so the isolated
				// values are got from the helper object.
				const packetsPerSecond = this._packets[kind].getLastRelativeValue() / elapsedSeconds
				this._packetsPerSecond[kind].add(packetsPerSecond)
			}
		}
	},

	_calculateConnectionQualityAudio: function() {
		return this._calculateConnectionQuality(this._packetsLostRatio['audio'], this._packetsPerSecond['audio'])
	},

	_calculateConnectionQualityVideo: function() {
		return this._calculateConnectionQuality(this._packetsLostRatio['video'], this._packetsPerSecond['video'])
	},

	_calculateConnectionQuality: function(packetsLostRatio, packetsPerSecond) {
		if (!packetsLostRatio.hasEnoughData() || !packetsPerSecond.hasEnoughData()) {
			return CONNECTION_QUALITY.UNKNOWN
		}

		const packetsLostRatioWeightedAverage = packetsLostRatio.getWeightedAverage()
		if (packetsLostRatioWeightedAverage >= 1) {
			return CONNECTION_QUALITY.NO_TRANSMITTED_DATA
		}

		// In some cases there may be packets being transmitted without any lost
		// packet, but if the number of packets is too low the connection is
		// most likely in bad shape anyway.
		// TODO the threshold may need to change for audio and video
		if (packetsPerSecond.getWeightedAverage() < 10) {
			return CONNECTION_QUALITY.VERY_BAD
		}

		if (packetsLostRatioWeightedAverage > 0.3) {
			return CONNECTION_QUALITY.VERY_BAD
		}

		if (packetsLostRatioWeightedAverage > 0.2) {
			return CONNECTION_QUALITY.BAD
		}

		if (packetsLostRatioWeightedAverage > 0.1) {
			return CONNECTION_QUALITY.MEDIUM
		}

		return CONNECTION_QUALITY.GOOD
	},

}

export {
	CONNECTION_QUALITY,
	PEER_DIRECTION,
	PeerConnectionAnalyzer,
}
