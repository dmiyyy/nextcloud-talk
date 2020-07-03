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

// TODO remove
import { showError } from '@nextcloud/dialogs'
import Plotly from 'plotly.js-dist'

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

	// TODO remove
	this._setUpNotifications()
}
PeerConnectionAnalyzer.prototype = {

	// TODO remove
	_setUpNotifications: function() {
		// TODO Should be there a "grace period" for the notifications or a
		// grace period for the quality? And should that be taken into account
		// here or in a class using this one?
		const handleChangeConnectionQualityAudio = (analyzer, currentQuality) => {
			if (this._connectionQualityAudioNotification) {
				this._connectionQualityAudioNotification.hideToast()
			}

			if (currentQuality === CONNECTION_QUALITY.MEDIUM) {
				this._connectionQualityAudioNotification = showError('Medium audio connection quality', { timeout: 0 })
			} else if (currentQuality === CONNECTION_QUALITY.BAD) {
				this._connectionQualityAudioNotification = showError('Bad audio connection quality', { timeout: 0 })
			} else if (currentQuality === CONNECTION_QUALITY.VERY_BAD) {
				this._connectionQualityAudioNotification = showError('Very bad audio connection quality', { timeout: 0 })
			} else if (currentQuality === CONNECTION_QUALITY.NO_TRANSMITTED_DATA) {
				this._connectionQualityAudioNotification = showError('No audio data', { timeout: 0 })
			} else if (currentQuality === CONNECTION_QUALITY.UNKNOWN && this._peerConnection.iceConnectionState !== 'connected' && this._peerConnection.iceConnectionState !== 'completed') {
				this._connectionQualityAudioNotification = showError('No audio connection', { timeout: 0 })
			}
		}
		const handleChangeConnectionQualityVideo = (analyzer, currentQuality) => {
			if (this._connectionQualityVideoNotification) {
				this._connectionQualityVideoNotification.hideToast()
			}

			if (currentQuality === CONNECTION_QUALITY.MEDIUM) {
				this._connectionQualityVideoNotification = showError('Medium video connection quality', { timeout: 0 })
			} else if (currentQuality === CONNECTION_QUALITY.BAD) {
				this._connectionQualityVideoNotification = showError('Bad video connection quality', { timeout: 0 })
			} else if (currentQuality === CONNECTION_QUALITY.VERY_BAD) {
				this._connectionQualityVideoNotification = showError('Very bad video connection quality', { timeout: 0 })
			} else if (currentQuality === CONNECTION_QUALITY.NO_TRANSMITTED_DATA) {
				this._connectionQualityVideoNotification = showError('No video data', { timeout: 0 })
			} else if (currentQuality === CONNECTION_QUALITY.UNKNOWN && this._peerConnection.iceConnectionState !== 'connected' && this._peerConnection.iceConnectionState !== 'completed') {
				this._connectionQualityVideoNotification = showError('No video connection', { timeout: 0 })
			}
		}

		this.on('change:connectionQualityAudio', handleChangeConnectionQualityAudio)
		// this.on('change:connectionQualityVideo', handleChangeConnectionQualityVideo)
	},

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
			// TODO remove
			console.debug('Stopping analyzer: ' + (!this._peerConnection ? 'no peer connection anymore' : this._peerConnection.iceConnectionState))

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

		if (this._peerConnection.iceConnectionState === 'disconnected') {
			console.debug('Processing disconnected stats')
// 			showError('Processing disconnected stats', { timeout: 2 })
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

		// TODO remove
		this.printAudioPackagesLostRatio()
		this.printVideoPackagesLostRatio()
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

		const roundTripTime = {
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
				// TODO
				if ('nackCount' in stat && 'kind' in stat) {
// 					console.debug('nackCount for ' + stat.kind + ': ' + stat.nackCount)
				}
				// TODO
				if ('bitrateMean' in stat && 'kind' in stat) {
// 					console.debug('bitrateMean for ' + stat.kind + ': ' + stat.bitrateMean)
				}
				// TODO
				if ('bitrateStdDev' in stat && 'kind' in stat) {
// 					console.debug('bitrateStdDev for ' + stat.kind + ': ' + stat.bitrateStdDev)
				}
				// TODO
				if ('framerateMean' in stat && 'kind' in stat) {
// 					console.debug('framerateMean for ' + stat.kind + ': ' + stat.framerateMean)
				}
				// TODO
				if ('framerateStdDev' in stat && 'kind' in stat) {
// 					console.debug('framerateStdDev for ' + stat.kind + ': ' + stat.framerateStdDev)
				}
				// TODO
				if ('qpSum' in stat && 'kind' in stat) {
// 					console.debug('qpSum for ' + stat.kind + ': ' + stat.qpSum)
				}
			} else if (stat.type === 'remote-inbound-rtp') {
				if ('packetsReceived' in stat && 'kind' in stat) {
					packetsReceived[stat.kind] = stat.packetsReceived

					if ('timestamp' in stat && 'kind' in stat) {
						timestampReceived[stat.kind] = stat.timestamp
					}
				}
				// TODO packetsLost for video sometimes gets a lower value, even
				// with video enabled... why? Could it be that a newer stat is
				// received before an older one? Check that timestamps always
				// increase
				//
				// TODO when video is disabled the values are meaningless, at
				// least in Firefox (it is not a monotonic increasing value).
				// Moreover, the packet number is probably so low in that case
				// that even if lost packets were properly reported it won't be
				// of much help (check it, though), so video connection quality
				// when video is disabled should probably be ignored.
				if ('packetsLost' in stat && 'kind' in stat) {
					packetsLost[stat.kind] = stat.packetsLost
				}
				// TODO packetsLost and nackCount could be 0 when TCP is used
				// (they are in Firefox, but not in Chromium, although in
				// Chromium the values look lower than expected anyways).
				// However that doesn't mean that the connection is good; it may
				// have a massive lag, and the streams may not be smooth either,
				// as once the packets are finally delivered they might be
				// already "rendered".
				if ('roundTripTime' in stat && 'kind' in stat) {
// 					console.debug('roundTripTime for ' + stat.kind + ': ' + stat.roundTripTime)
					roundTripTime[stat.kind] = stat.roundTripTime
				}

				// TODO jitter measures how "inconsistent" is the rate of the
				// packets (they are sent at the same interval, but they may be
				// received with different time spacing between each). The units
				// are not clear, though. Not sure if using it is worth it
				// (check randomizing a lot the packets in the net interface).
			}
		}

		if (timestampSent['audio'] !== timestampSent['video']) {
// 			console.warn('Audio and video timestamps sent are different!: ' + timestampSent['audio'] + ' ' + timestampSent['video'])
		}
		if (timestampReceived['audio'] !== timestampReceived['video']) {
// 			console.warn('Audio and video timestamps received are different!: ' + timestampReceived['audio'] + ' ' + timestampReceived['video'])
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

			if (timestampReceived[kind] >= 0 && this._timestamps[kind].getLastRawValue() > timestampReceived[kind]) {
				console.warn('Timestamp ' + kind + ' is from the past!: ' + this._timestamps[kind].getLastRawValue() + ' ' + timestampReceived[kind])
			}

			if (packetsReceived[kind] >= 0) {
// 				console.debug('Packets received for sent ' + kind + ': ' + packetsReceived[kind])
				this._packets[kind].add(packetsReceived[kind])

				if (this._packets[kind].getLastRelativeValue() < 0) {
					console.warn('Packets < 0!: ' + this._packets[kind].getLastRelativeValue() + ' roundTripTime: ' + roundTripTime[kind])
				}
			}
			if (packetsLost[kind] >= 0) {
// 				console.debug('Packets lost for sent ' + kind + ': ' + packetsLost[kind])
				this._packetsLost[kind].add(packetsLost[kind])

				// TODO when packets have high delay the lost packets stats can
				// go "backwards" (probably because the browser assumes that
				// certain packet was lost but then finds out that it wasn't, or
				// something like that...); in that case just repeat the last
				// known value, as "removing" lost packets would skew the stats.
				// TODO does it happen only for packetsLost or also for packets?
				if (this._packetsLost[kind].getLastRelativeValue() < 0) {
					console.warn('Packets lost < 0!: ' + this._packetsLost[kind].getLastRelativeValue() + ' roundTripTime: ' + roundTripTime[kind])
				}
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
// 				console.debug('Packets lost ratio for sent ' + kind + ': ' + packetsLostRatio)
				this._packetsLostRatio[kind].add(packetsLostRatio)
			}
			if (timestampReceived[kind] >= 0) {
// 				console.debug('Timestamp for sent ' + kind + ': ' + timestampReceived[kind])
				this._timestamps[kind].add(timestampReceived[kind])
			}
			if (packetsReceived[kind] >= 0 && timestampReceived[kind] >= 0) {
				const elapsedSeconds = this._timestamps[kind].getLastRelativeValue() / 1000
// 				console.debug('Elapsed seconds: ' + elapsedSeconds)
				// The packet stats are cumulative values, so the isolated
				// values are got from the helper object.
				const packetsPerSecond = this._packets[kind].getLastRelativeValue() / elapsedSeconds
// 				console.debug('Packets per second for sent ' + kind + ': ' + packetsPerSecond)
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
				if ('nackCount' in stat && 'kind' in stat) {
// 					console.debug('nackCount for ' + stat.kind + ': ' + stat.nackCount)
				}
				if ('jitter' in stat && 'kind' in stat) {
// 					console.debug('jitter for ' + stat.kind + ': ' + stat.jitter)
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
// 				console.debug('Packets received for received ' + kind + ': ' + packetsReceived[kind])
				this._packets[kind].add(packetsReceived[kind])
			}
			if (packetsLost[kind] >= 0) {
// 				console.debug('Packets lost for received ' + kind + ': ' + packetsLost[kind])
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
// 				console.debug('Packets lost ratio for received ' + kind + ': ' + packetsLostRatio)
				this._packetsLostRatio[kind].add(packetsLostRatio)
			}
			if (timestamp[kind] >= 0) {
// 				console.debug('Timestamp for received ' + kind + ': ' + timestamp[kind])
				this._timestamps[kind].add(timestamp[kind])
			}
			if (packetsReceived[kind] >= 0 && timestamp[kind] >= 0) {
				const elapsedSeconds = this._timestamps[kind].getLastRelativeValue() / 1000
// 				console.debug('Elapsed seconds: ' + elapsedSeconds)
				// The packet stats are cumulative values, so the isolated
				// values are got from the helper object.
				const packetsPerSecond = this._packets[kind].getLastRelativeValue() / elapsedSeconds
// 				console.debug('Packets per second for received ' + kind + ': ' + packetsPerSecond)
				this._packetsPerSecond[kind].add(packetsPerSecond)
			}
		}
	},

	_calculateConnectionQualityAudio: function() {
		// TODO remove
// 		if (this._packetsPerSecond['audio'].getWeightedAverage() < 10 && this._packetsLostRatio['audio'].getWeightedAverage() <= 0.3) {
// 			if (this._averageButNoLastPacketNotification) {
// 				this._averageButNoLastPacketNotification.hideToast()
// 				this._averageButNoLastPacketNotification = null
// 			}
// 			if (this._invalidAndNoLastPacketNotification) {
// 				this._invalidAndNoLastPacketNotification.hideToast()
// 				this._invalidAndNoLastPacketNotification = null
// 			}
// 			if (!this._lowPacketsPerSecondNotification) {
// 				this._lowPacketsPerSecondNotification = showError('Low lost packets ratio but low packet count too', { timeout: 0 })
// 			}
// 		} else if (this._packetsLostRatio['audio'].getWeightedAverage() < 1 && !this._packets['audio'].getLastRelativeValue()) {
// // 		if (this._packets['audio'].getWeightedAverage() && !this._packets['audio'].getLastRelativeValue()) {
// 			if (this._lowPacketsPerSecondNotification) {
// 				this._lowPacketsPerSecondNotification.hideToast()
// 				this._lowPacketsPerSecondNotification = null
// 			}
// 			if (this._invalidAndNoLastPacketNotification) {
// 				this._invalidAndNoLastPacketNotification.hideToast()
// 				this._invalidAndNoLastPacketNotification = null
// 			}
// 			if (!this._averageButNoLastPacketNotification) {
// 				this._averageButNoLastPacketNotification = showError('Average but not last packet', { timeout: 0 })
// 			}
// 		} else if (!this._packets['audio'].hasEnoughData() && !this._packets['audio'].getLastRelativeValue()) {
// 			if (this._lowPacketsPerSecondNotification) {
// 				this._lowPacketsPerSecondNotification.hideToast()
// 				this._lowPacketsPerSecondNotification = null
// 			}
// 			if (this._averageButNoLastPacketNotification) {
// 				this._averageButNoLastPacketNotification.hideToast()
// 				this._averageButNoLastPacketNotification = null
// 			}
// 			if (!this._invalidAndNoLastPacketNotification) {
// 				this._invalidAndNoLastPacketNotification = showError('Not enough data and no last packet', { timeout: 0 })
// 			}
// 		} else {
// 			if (this._lowPacketsPerSecondNotification) {
// 				this._lowPacketsPerSecondNotification.hideToast()
// 				this._lowPacketsPerSecondNotification = null
// 			}
// 			if (this._averageButNoLastPacketNotification) {
// 				this._averageButNoLastPacketNotification.hideToast()
// 				this._averageButNoLastPacketNotification = null
// 			}
// 			if (this._invalidAndNoLastPacketNotification) {
// 				this._invalidAndNoLastPacketNotification.hideToast()
// 				this._invalidAndNoLastPacketNotification = null
// 			}
// 		}

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

	// TODO remove
	printAudioPackagesLostRatio: function() {
		this.printPackagesLostRatio(this._packets['audio'], this._packetsLost['audio'], this._packetsLostRatio['audio'], this._packetsPerSecond['audio'], 'audio')
	},
	printVideoPackagesLostRatio: function() {
		this.printPackagesLostRatio(this._packets['video'], this._packetsLost['video'], this._packetsLostRatio['video'], this._packetsPerSecond['video'], 'video')
	},
	printPackagesLostRatio: function(packets, packetsLost, packetsLostRatio, packetsPerSecond, kind) {
		if (!packets.hasEnoughData() || !packetsLost.hasEnoughData()) {
// 			console.debug('Packages lost ratio: not enough data yet')
			return
		}

		const packetsWeightedAverage = packets.getWeightedAverage()
		const packetsLostWeightedAverage = packetsLost.getWeightedAverage()
		const packetsAverageAverage = packets.getAverage()
		const packetsLostAverageAverage = packetsLost.getAverage()
		const packetsMedianAverage = packets.getMedian()
		const packetsLostMedianAverage = packetsLost.getMedian()
		const packetsRaw = packets.getLastRelativeValue()
		const packetsLostRaw = packetsLost.getLastRelativeValue()

		if (!packetsWeightedAverage) {
// 			console.debug('No packages for a while, it will be probably disconnected soon')
		}

		let packetsLostWeightedRatio = packetsLostWeightedAverage / packetsWeightedAverage
		let packetsLostAverageRatio = packetsLostAverageAverage / packetsAverageAverage
		let packetsLostMedianRatio = packetsLostMedianAverage / packetsMedianAverage
		let packetsLostRawRatio = packetsLostRaw / packetsRaw

// 		console.debug('Packages lost ratio weighted: ' + packetsLostWeightedRatio)
// 		console.debug('Packages lost ratio average: ' + packetsLostAverageRatio)
// 		console.debug('Packages lost ratio median: ' + packetsLostMedianRatio)

		if (kind === 'video') {
			return
		}

		if (Number.isNaN(packetsLostWeightedRatio)) {
			packetsLostWeightedRatio = 1.5
		}
		if (Number.isNaN(packetsLostAverageRatio)) {
			packetsLostAverageRatio = 1.5
		}
		if (Number.isNaN(packetsLostMedianRatio)) {
			packetsLostMedianRatio = 1.5
		}
		if (Number.isNaN(packetsLostRawRatio)) {
			packetsLostRawRatio = 1.5
		}

		const packetsLostRatioWeighted = packetsLostRatio.getWeightedAverage()
		const packetsLostRatioAverage = packetsLostRatio.getAverage()
		const packetsLostRatioMedian = packetsLostRatio.getMedian()
		const packetsLostRatioRaw = packetsLostRatio.getLastRelativeValue()

		const packetsPerSecondRaw = packetsPerSecond.getLastRelativeValue()
		const packetsPerSecondWeightedAverage = packetsPerSecond.getWeightedAverage()

		if (!this._packetsLostWeightedRatios) {
			this._packetsLostWeightedRatios = []
			this._packetsLostAverageRatios = []
			this._packetsLostMedianRatios = []
			this._packetsLostRawRatios = []

			this._packetsLostRatioWeighteds = []
			this._packetsLostRatioAverages = []
			this._packetsLostRatioMedians = []
			this._packetsLostRatioRaws = []

			this._packetsPerSecondRaw = []
			this._packetsRaw = []
			this._packetsPerSecondWeighted = []
			this._packetsWeighted = []
			this._packetsLostRaw = []
			this._packetsLostWeightedAverage = []
		}

		this._packetsLostWeightedRatios.push(packetsLostWeightedRatio)
		this._packetsLostAverageRatios.push(packetsLostAverageRatio)
		this._packetsLostMedianRatios.push(packetsLostMedianRatio)
		this._packetsLostRawRatios.push(packetsLostRawRatio)

		this._packetsLostRatioWeighteds.push(packetsLostRatioWeighted)
		this._packetsLostRatioAverages.push(packetsLostRatioAverage)
		this._packetsLostRatioMedians.push(packetsLostRatioMedian)
		this._packetsLostRatioRaws.push(packetsLostRatioRaw)

		this._packetsPerSecondRaw.push(packetsPerSecondRaw)
		this._packetsRaw.push(packetsRaw)
		this._packetsPerSecondWeighted.push(packetsPerSecondWeightedAverage)
		this._packetsWeighted.push(packetsWeightedAverage)
		this._packetsLostRaw.push(packetsLostRaw)
		this._packetsLostWeightedAverage.push(packetsLostWeightedAverage)

		if (this._packetsLostWeightedRatios.length % 10) {
			return
		}

		const axisX = []
		for (let i = 0; i < this._packetsLostWeightedRatios.length; i++) {
			axisX.push(i + 1)
		}

		const trace1 = {
			y: this._packetsLostWeightedRatios,
			x: axisX,
			type: 'scatter',
			name: 'Weighted',
		}

		const trace2 = {
			y: this._packetsLostAverageRatios,
			x: axisX,
			type: 'scatter',
			name: 'Average',
		}

		const trace3 = {
			y: this._packetsLostMedianRatios,
			x: axisX,
			type: 'scatter',
			name: 'Median',
		}

		const trace4 = {
			y: this._packetsLostRawRatios,
			x: axisX,
			type: 'scatter',
			name: 'Raw',
		}

		const trace5 = {
			y: this._packetsLostRatioWeighteds,
			x: axisX,
			type: 'scatter',
			name: 'Ratio weighted',
		}

		const trace6 = {
			y: this._packetsLostRatioAverages,
			x: axisX,
			type: 'scatter',
			name: 'Ratio average',
		}

		const trace7 = {
			y: this._packetsLostRatioMedians,
			x: axisX,
			type: 'scatter',
			name: 'Ratio median',
		}

		const trace8 = {
			y: this._packetsLostRatioRaws,
			x: axisX,
			type: 'scatter',
			name: 'Ratio raw',
		}

		let data = [trace1, trace2, trace3, trace4, trace5, trace6, trace7, trace8]

		console.debug('Plotting data: ' + this._packetsLostWeightedRatios.length + ' ' + axisX.length)

		if (this._addConnectionStatsElement()) {
			this.hideConnectionStats()
		}

		const packetsPerSecondTrace = {
			y: this._packetsPerSecond,
			x: axisX,
			type: 'scatter',
			name: 'Packets per second',
		}

		const packetsTrace = {
			y: this._packets,
			x: axisX,
			type: 'scatter',
			name: 'Packets',
		}

		const packetsPerSecondWeightedTrace = {
			y: this._packetsPerSecondWeighted,
			x: axisX,
			type: 'scatter',
			name: 'Packets per second weighted',
		}

		const packetsWeightedTrace = {
			y: this._packetsWeighted,
			x: axisX,
			type: 'scatter',
			name: 'Packets weighted',
		}

		const packetsLostTrace = {
			y: this._packetsLost,
			x: axisX,
			type: 'scatter',
			name: 'Packets lost',
		}

		const packetsLostWeightedAverageTrace = {
			y: this._packetsLostWeightedAverage,
			x: axisX,
			type: 'scatter',
			name: 'Packets lost weighted',
		}

		data = [packetsPerSecondTrace, packetsTrace, packetsPerSecondWeightedTrace, packetsWeightedTrace, packetsLostTrace, packetsLostWeightedAverageTrace]

		Plotly.react('connectionStats', data, { uirevision: 'true' })
	},

	_addConnectionStatsElement: function() {
		// TODO index by peer id
		if (document.getElementById('connectionStats')) {
			return false
		}

		const connectionStatsElement = document.createElement('div')
		connectionStatsElement.setAttribute('id', 'connectionStats')
		connectionStatsElement.setAttribute('style', 'height: 300px; width: 100%; position: absolute; bottom: 0;')
		document.getElementById('call-container').append(connectionStatsElement)

		return true
	},

	showConnectionStats: function() {
		const connectionStatsElement = document.getElementById('connectionStats')
		if (!connectionStatsElement) {
			return
		}

		connectionStatsElement.classList.remove('hidden')
	},

	hideConnectionStats: function() {
		const connectionStatsElement = document.getElementById('connectionStats')
		if (!connectionStatsElement) {
			return
		}

		connectionStatsElement.classList.add('hidden')
	},

}

export {
	CONNECTION_QUALITY,
	PEER_DIRECTION,
	PeerConnectionAnalyzer,
}
