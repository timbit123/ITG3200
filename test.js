global.XAXIS = 0;
global.YAXIS = 1;
global.ZAXIS = 2;

var itg3200 = require('./index.js');

var globVar = {
	FINDZERO : 49,
	gyroRate : [0.0, 0.0, 0.0],
	gyroZero : [0, 0, 0],
	gyroSample : [0, 0, 0],
	gyroScaleFactor : 0.0,
	gyroHeading : 0.0,
	gyroLastMesuredTime : 0,
	gyroSampleCount : 0
}

Math.degrees = function(radians) {

	return radians * 180 / Math.PI;

};

itg3200.init(globVar, function(err) {
	if (!err) {
		itg3200.calibrateGyro(function(calibrated) {
			if (calibrated) {
				setInterval(function() {
					itg3200.measureGyro(function(err) {
						if (!err) {
							console.log("Roll: " + Math.degrees(globVar.gyroRate[global.XAXIS]) + 
							" Pitch: " + Math.degrees(globVar.gyroRate[global.YAXIS]) + 
							" Yaw: " + Math.degrees(globVar.gyroRate[global.ZAXIS]) + 
							" Heading: " + Math.degrees(globVar.gyroHeading));
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
