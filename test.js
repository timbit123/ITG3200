global.XAXIS = 0;
global.YAXIS = 1;
global.ZAXIS = 2;

var ITG3200 = require('./index.js');


function degrees(radians) {

	return radians * 180 / Math.PI;

};

var gyro = new ITG3200(function(err) {
	if (!err) {
		gyro.calibrateGyro(function(calibrated) {
			if (calibrated) {
				setInterval(function() {
					gyro.measureGyro(function(err) {
						if (!err) {
							console.log("Roll: " + degrees(gyro.gyroRate[global.XAXIS]) + 
							" Pitch: " + degrees(gyro.gyroRate[global.YAXIS]) + 
							" Yaw: " + degrees(gyro.gyroRate[global.ZAXIS]) + 
							" Heading: " + degrees(gyro.gyroHeading));
						} else {
							console.log(err);
						}
					});
				}, 10);
			} else {
				console.log("error while calibrating, gyro moved");
			}
		});
	}
});
