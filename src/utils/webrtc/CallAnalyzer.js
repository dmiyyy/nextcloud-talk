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
	ParticipantAnalyzer,
} from './ParticipantAnalyzer'

/**
 * TODO documentation
 *
 * @param {LocalMediaModel} localMediaModel the model for the local media.
 * @param {LocalCallParticipantModel} localCallParticipantModel the model for
 *        the local participant; null if an MCU is not used.
 * @param {CallParticipantCollection} callParticipantCollection the collection
 *        for the remote participants.
 */
export default function CallAnalyzer(localMediaModel, localCallParticipantModel, callParticipantCollection) {
	this.attributes = {
		senderConnectionQualityAudio: null,
	}

	this._handlers = []

	this._localMediaModel = localMediaModel
	this._localCallParticipantModel = localCallParticipantModel
	this._callParticipantCollection = callParticipantCollection

	this._handleSenderConnectionQualityAudioChangeBound = this._handleSenderConnectionQualityAudioChange.bind(this)

	if (localCallParticipantModel) {
		this._localParticipantAnalyzer = new ParticipantAnalyzer()
		this._localParticipantAnalyzer.setSenderParticipant(localMediaModel, localCallParticipantModel)

		this._localParticipantAnalyzer.on('change:senderConnectionQualityAudio', this._handleSenderConnectionQualityAudioChangeBound)
	}
}
CallAnalyzer.prototype = {

	get: function(key) {
		return this.attributes[key]
	},

	set: function(key, value) {
		this.attributes[key] = value

		this._trigger('change:' + key, [value])
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

	destroy: function() {
		if (this._localParticipantAnalyzer) {
			this._localParticipantAnalyzer.off('change:senderConnectionQualityAudio', this._handleSenderConnectionQualityAudioChangeBound)

			this._localParticipantAnalyzer.destroy()
		}
	},

	_handleSenderConnectionQualityAudioChange: function(participantAnalyzer, senderConnectionQualityAudio) {
		this.set('senderConnectionQualityAudio', senderConnectionQualityAudio)
	},

}
