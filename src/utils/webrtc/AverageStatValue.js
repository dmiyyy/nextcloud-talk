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

const STAT_VALUE_TYPE = {
	CUMULATIVE: 0,
	RELATIVE: 1,
}

/**
 * Helper to calculate the average of the last N instances of an RTCStatsReport
 * value.
 *
 * TODO documentation
 *
 * @param {int} count the number of instances to take into account.
 * @param {STAT_VALUE_TYPE} type whether the value is cumulative or relative.
 * @param {int} lastValueWeight the value to calculate the weights of all the
 *        items, from the first (weight 1) to the last one.
 */
function AverageStatValue(count, type = STAT_VALUE_TYPE.CUMULATIVE, lastValueWeight = 3) {
	this._count = count
	this._type = type
	this._extraWeightForEachElement = (lastValueWeight - 1) / (count - 1)

	this._rawValues = []
	this._relativeValues = []
}
AverageStatValue.prototype = {

	reset: function() {
		this._rawValues = []
		this._relativeValues = []
	},

	add: function(value) {
		if (this._rawValues.length === this._count) {
			this._rawValues.shift()
			this._relativeValues.shift()
		}

		let relativeValue = value
		if (this._type === STAT_VALUE_TYPE.CUMULATIVE) {
			// The first added value will be meaningless as it will be 0 and
			// used as the base for the rest of values.
			const lastRawValue = this._rawValues.length ? this._rawValues[this._rawValues.length - 1] : value
			relativeValue = value - lastRawValue
		}

		this._rawValues.push(value)
		this._relativeValues.push(relativeValue)
	},

	getLastRawValue: function() {
		if (this._rawValues.length < 1) {
			return NaN
		}

		return this._rawValues[this._rawValues.length - 1]
	},

	getLastRelativeValue: function() {
		if (this._relativeValues.length < 1) {
			return NaN
		}

		return this._relativeValues[this._relativeValues.length - 1]
	},

	hasEnoughData: function() {
		return this._rawValues.length === this._count
	},

	getWeightedAverage: function() {
		let weightedValues = 0
		let weightsSum = 0

		for (let i = 0; i < this._relativeValues.length; i++) {
			const weight = 1 + (i * this._extraWeightForEachElement)

			weightedValues += this._relativeValues[i] * weight
			weightsSum += weight
		}

		return weightedValues / weightsSum
	},

}

export {
	STAT_VALUE_TYPE,
	AverageStatValue,
}
