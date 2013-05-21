var i2c = require('i2c');
var async = require('async');
var address = 0x68;
var wire;
var classITG3200 = {};

var GYRO_CALIBRATION_TRESHOLD = 4

var ITG3200_IDENTITY = 0x68
var ITG3200_IDENTITY_MASK = 0x7E
var ITG3200_MEMORY_ADDRESS = 0x1D
var ITG3200_BUFFER_SIZE = 6
var ITG3200_RESET_ADDRESS = 0x3E
var ITG3200_RESET_VALUE = 0x80
var ITG3200_LOW_PASS_FILTER_ADDR = 0x16
var ITG3200_LOW_PASS_FILTER_VALUE = 0x1D// 10Hz low pass filter
var ITG3200_OSCILLATOR_ADDR = 0x3E
var ITG3200_OSCILLATOR_VALUE = 0x01// use X gyro oscillator
var ITG3200_SCALE_TO_RADIANS = 823.626831// 14.375 LSBs per °/sec, / Pi / 180
var ITG3200_TEMPERATURE_ADDRESS = 0x1B

var gyroTempBias = [0.0, 0.0, 0.0];

var globVar;

// Converts from degrees to radians.
Math.radians = function(degrees) {
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
classITG3200.init = function(vars, callback) {
	globVar = vars;
	//init stuff here
	wire = new i2c(address, {
		device : '/dev/i2c-1'
	});

	globVar.gyroScaleFactor = Math.radians(1.0 / 14.375);

	async.waterfall([
	function(cb) {
		wire.writeBytes(ITG3200_RESET_ADDRESS, [ITG3200_RESET_VALUE], function(err) {
			cb(err);
		});
	},
	function(cb) {
		wire.writeBytes(ITG3200_LOW_PASS_FILTER_ADDR, [ITG3200_LOW_PASS_FILTER_VALUE], function(err) {
			cb(err);
		});
	},
	function(cb) {
		wire.writeBytes(ITG3200_RESET_ADDRESS, [ITG3200_OSCILLATOR_VALUE], function(err) {
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

classITG3200.calibrateGyro = function(callback) {
	//Finds gyro drift.
	//Returns false if during calibration there was movement of board.

	var findZeros;

	function getSample(count, axis, cb) {
		if (count < globVar.FINDZERO) {
			wire.readBytes((axis * 2) + ITG3200_MEMORY_ADDRESS, 2, function(err, res) {
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
			findZeros = new Array(globVar.FINDZERO);
			getSample(0, axis, function() {
				findZeros.sort();
				var diff = Math.abs(findZeros[0] - findZeros[findZeros.length - 1]);
				var tmp = findZeros[Math.round(findZeros.length / 2)];
				if (diff <= GYRO_CALIBRATION_TRESHOLD) {// 4 = 0.27826087 degrees during 49*10ms measurements (490ms). 0.57deg/s difference between first and last.
					globVar.gyroZero[axis] = tmp;
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

classITG3200.measureGyro = function(callback) {

	wire.readBytes(ITG3200_MEMORY_ADDRESS, ITG3200_BUFFER_SIZE, function(err, res) {
		if (!err) {
			var gyroADC = new Array(3);
			gyroADC[global.XAXIS] = res.readInt16BE(global.XAXIS * 2) - globVar.gyroZero[global.XAXIS];
			gyroADC[global.YAXIS] = globVar.gyroZero[global.YAXIS] - res.readInt16BE(global.YAXIS * 2);
			gyroADC[global.ZAXIS] = globVar.gyroZero[global.ZAXIS] - res.readInt16BE(global.ZAXIS * 2);

			for (var axis = global.XAXIS; axis <= global.ZAXIS; axis++) {
				globVar.gyroRate[axis] = gyroADC[axis] * globVar.gyroScaleFactor;
			}

			// Measure gyro heading
			var currentTime = parseInt(process.hrtime()[1] / 1000);
			var delta = ((currentTime - globVar.gyroLastMesuredTime) / 1000000.0);
			//we want microseconds, process.hrtime give [seconds, nanosec], 1 microsec = 1000 nanosec
			if (globVar.gyroRate[ZAXIS] > Math.radians(1.0) || globVar.gyroRate[ZAXIS] < Math.radians(-1.0)) {
				globVar.gyroHeading += globVar.gyroRate[ZAXIS] * delta;
			}
			globVar.gyroLastMesuredTime = currentTime;
			callback(null);
		} else {
			callback(err);
		}
	});

}

classITG3200.measureGyroSum = function(callback) {
	//get values from sensor here
	wire.readBytes(ITG3200_MEMORY_ADDRESS, ITG3200_BUFFER_SIZE, function(err, res) {
		if (!err) {
			for (var axis = global.XAXIS; axis <= global.ZAXIS; axis++) {
				globVar.gyroSample[axis] += res.readInt16BE(axis * 2)
			}
			globVar.gyroSampleCount++;
			callback(null);
		} else {
			callback(err);
		}
	});

}

classITG3200.evaluateGyroRate = function() {
	var gyroADC = new Array(3);
	gyroADC[global.XAXIS] = (globVar.gyroSample[global.XAXIS] / globVar.gyroSampleCount) - globVar.gyroZero[global.XAXIS];
	gyroADC[global.YAXIS] = globVar.gyroZero[global.YAXIS] - (globVar.gyroSample[global.YAXIS] / globVar.gyroSampleCount);
	gyroADC[global.ZAXIS] = globVar.gyroZero[global.ZAXIS] - (globVar.gyroSample[global.ZAXIS] / globVar.gyroSampleCount);

	globVar.gyroSample[globVar.XAXIS] = 0;
	globVar.gyroSample[globVar.YAXIS] = 0;
	globVar.gyroSample[globVar.ZAXIS] = 0;
	globVar.gyroSampleCount = 0;

	for (var axis = 0; axis <= global.ZAXIS; axis++) {
		globVar.gyroRate[axis] = gyroADC[axis] * globVar.gyroScaleFactor;
	}

	// Measure gyro heading
	var currentTime = process.hrtime()[1] * 1000;
	//we want microseconds, process.hrtime give [seconds, nanosec], 1 microsec = 1000 nanosec
	if (globVar.gyroRate[ZAXIS] > Math.radians(1.0) || globVar.gyroRate[ZAXIS] < Math.radians(-1.0)) {
		globVar.gyroHeading += globVar.gyroRate[ZAXIS] * ((currentTime - globVar.gyroLastMesuredTime) / 1000000.0);
	}
	globVar.gyroLastMesuredTime = currentTime;

	callback();
}

module.exports = classITG3200;
