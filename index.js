var i2c = require('i2c');
var async = require('async');
var address = 0x68;
var wire;

ITG3200.GYRO_CALIBRATION_TRESHOLD = 4

ITG3200.ITG3200_IDENTITY = 0x68
ITG3200.ITG3200_IDENTITY_MASK = 0x7E
ITG3200.ITG3200_MEMORY_ADDRESS = 0x1D
ITG3200.ITG3200_BUFFER_SIZE = 6
ITG3200.ITG3200_RESET_ADDRESS = 0x3E
ITG3200.ITG3200_RESET_VALUE = 0x80
ITG3200.ITG3200_LOW_PASS_FILTER_ADDR = 0x16
ITG3200.ITG3200_LOW_PASS_FILTER_VALUE = 0x1D// 10Hz low pass filter
ITG3200.ITG3200_OSCILLATOR_ADDR = 0x3E
ITG3200.ITG3200_OSCILLATOR_VALUE = 0x01// use X gyro oscillator
ITG3200.ITG3200_SCALE_TO_RADIANS = 823.626831// 14.375 LSBs per °/sec, / Pi / 180
ITG3200.ITG3200_TEMPERATURE_ADDRESS = 0x1B

var gyroTempBias = [0.0, 0.0, 0.0];

// Converts from degrees to radians.
function radians(degrees) {
	return degrees * Math.PI / 180;
};

/*
#define FINDZERO 49
float gyroRate[3] = {0.0,0.0,0.0};
int   gyroZero[3] = {0,0,0};
long  gyroSample[3] = {0,0,0};
float gyroScaleFactor = 0.0;
float gyroHeading = 0.0;
unsigned long gyroLastMesuredTime = 0;
byte gyroSampleCount = 0;
*/

/**
 *
 * @param {Object} vars
 * @param {Object} callback
 */
function ITG3200(callback) {
	this.FINDZERO = 49;
	this.gyroRate = [0.0, 0.0, 0.0];
	this.gyroZero = [0, 0, 0];
	this.gyroSample = [0, 0, 0];
	this.gyroScaleFactor = 0.0;
	this.gyroHeading = 0.0;
	this.gyroLastMesuredTime = 0;
	this.gyroSampleCount = 0;
	//init stuff here
	wire = new i2c(address, {
		device : '/dev/i2c-1'
	});

	this.gyroScaleFactor = radians(1.0 / 14.375);

	async.waterfall([
	function(cb) {
		wire.writeBytes(ITG3200.ITG3200_RESET_ADDRESS, [ITG3200.ITG3200_RESET_VALUE], function(err) {
			cb(err);
		});
	},
	function(cb) {
		wire.writeBytes(ITG3200.ITG3200_LOW_PASS_FILTER_ADDR, [ITG3200.ITG3200_LOW_PASS_FILTER_VALUE], function(err) {
			cb(err);
		});
	},
	function(cb) {
		wire.writeBytes(ITG3200.ITG3200_RESET_ADDRESS, [ITG3200.ITG3200_OSCILLATOR_VALUE], function(err) {
			cb(err);
		});
	}], function(err) {
		if (!err) {
			setTimeout(function() {
				callback(null);
			}, 1000);

		} else {
			callback(err);
		}
	});
};

ITG3200.prototype.calibrateGyro = function(callback) {
	//Finds gyro drift.
	//Returns false if during calibration there was movement of board.

	var findZeros;

	function getSample(count, axis, cb) {
		if (count < this.FINDZERO) {
			wire.readBytes((axis * 2) + ITG3200.ITG3200_MEMORY_ADDRESS, 2, function(err, res) {
				if (!err) {
					findZeros[count] = res.readInt16BE(0);
					setTimeout(getSample(++count, axis, cb), 10);
				} else {
					console.log(err);
				}
			});
		} else {
			cb();
		}
	}

	function findZero(axis) {
		if (axis < 3) {
			findZeros = new Array(this.FINDZERO);
			getSample(0, axis, function() {
				findZeros.sort();
				var diff = Math.abs(findZeros[0] - findZeros[findZeros.length - 1]);
				var tmp = findZeros[Math.round(findZeros.length / 2)];
				if (diff <= ITG3200.GYRO_CALIBRATION_TRESHOLD) {// 4 = 0.27826087 degrees during 49*10ms measurements (490ms). 0.57deg/s difference between first and last.
					this.gyroZero[axis] = tmp;
					findZero(++axis);
				} else {
					callback(false);
					return;
					//Calibration failed.
				}

			});
		} else {
			callback(true);
			//Calibration successfull.
		}
	}

	findZero(0);

}

ITG3200.prototype.measureGyro = function(callback) {

	wire.readBytes(ITG3200.ITG3200_MEMORY_ADDRESS, ITG3200.ITG3200_BUFFER_SIZE, function(err, res) {
		if (!err) {
			var gyroADC = new Array(3);
			gyroADC[global.XAXIS] = res.readInt16BE(global.XAXIS * 2) - this.gyroZero[global.XAXIS];
			gyroADC[global.YAXIS] = this.gyroZero[global.YAXIS] - res.readInt16BE(global.YAXIS * 2);
			gyroADC[global.ZAXIS] = this.gyroZero[global.ZAXIS] - res.readInt16BE(global.ZAXIS * 2);

			for (var axis = global.XAXIS; axis <= global.ZAXIS; axis++) {
				this.gyroRate[axis] = gyroADC[axis] * this.gyroScaleFactor;
			}

			// Measure gyro heading
			var currentTime = parseInt(process.hrtime()[1] / 1000);
			var delta = ((currentTime - this.gyroLastMesuredTime) / 1000000.0);
			//we want microseconds, process.hrtime give [seconds, nanosec], 1 microsec = 1000 nanosec
			if (this.gyroRate[global.ZAXIS] > radians(1.0) || this.gyroRate[global.ZAXIS] < radians(-1.0)) {
				this.gyroHeading += this.gyroRate[global.ZAXIS] * delta;
			}
			this.gyroLastMesuredTime = currentTime;
			callback(null);
		} else {
			callback(err);
		}
	});

}

ITG3200.prototype.measureGyroSum = function(callback) {
	//get values from sensor here
	wire.readBytes(ITG3200.ITG3200_MEMORY_ADDRESS, ITG3200.ITG3200_BUFFER_SIZE, function(err, res) {
		if (!err) {
			for (var axis = global.XAXIS; axis <= global.ZAXIS; axis++) {
				this.gyroSample[axis] += res.readInt16BE(axis * 2)
			}
			this.gyroSampleCount++;
			callback(null);
		} else {
			callback(err);
		}
	});

}

ITG3200.prototype.evaluateGyroRate = function() {
	var gyroADC = new Array(3);
	gyroADC[global.XAXIS] = (this.gyroSample[global.XAXIS] / this.gyroSampleCount) - this.gyroZero[global.XAXIS];
	gyroADC[global.YAXIS] = this.gyroZero[global.YAXIS] - (this.gyroSample[global.YAXIS] / this.gyroSampleCount);
	gyroADC[global.ZAXIS] = this.gyroZero[global.ZAXIS] - (this.gyroSample[global.ZAXIS] / this.gyroSampleCount);

	this.gyroSample[global.XAXIS] = 0;
	this.gyroSample[global.YAXIS] = 0;
	this.gyroSample[global.ZAXIS] = 0;
	this.gyroSampleCount = 0;

	for (var axis = 0; axis <= global.ZAXIS; axis++) {
		this.gyroRate[axis] = gyroADC[axis] * this.gyroScaleFactor;
	}

	// Measure gyro heading
	var currentTime = process.hrtime()[1] * 1000;
	//we want microseconds, process.hrtime give [seconds, nanosec], 1 microsec = 1000 nanosec
	if (this.gyroRate[global.ZAXIS] > radians(1.0) || this.gyroRate[global.ZAXIS] < radians(-1.0)) {
		this.gyroHeading += this.gyroRate[global.ZAXIS] * ((currentTime - this.gyroLastMesuredTime) / 1000000.0);
	}
	this.gyroLastMesuredTime = currentTime;

	callback();
}

module.exports = classITG3200;
