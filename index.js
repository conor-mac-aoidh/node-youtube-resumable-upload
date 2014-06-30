var fs = require('fs');
var google = require('googleapis');
var request = require('request');

function resumableUpload() {
  this.byteCount = 0; //init variables
  this.tokens = {};
  this.filepath = '';
  this.metadata = {};
  this.monitor = false;
};

//Init the upload by POSTing google for an upload URL (saved to self.location)
resumableUpload.prototype.initUpload = function(callback) {
  var self = this;
  var options = {
      url: 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status,contentDetails',
      headers: {
          'Host': 'www.googleapis.com',
          'Authorization': 'Bearer ' + this.tokens.access_token,
          'Content-Length': JSON.stringify(this.metadata).length,
          'Content-Type': 'application/json',
          'X-Upload-Content-Length': fs.statSync(this.filepath).size,
          'X-Upload-Content-Type': 'video/*'
      },
      body: JSON.stringify(this.metadata)
  };
  //Send request and start upload if success
  request.post(options, function(error, response, body) {
    if(!error) {
      console.log('Location: ' + response.headers.location + ' ...');
      self.location = response.headers.location;
      //once we get the location to upload to, we start the upload
      console.log('Starting upload ...');
      self.putUpload(function(result) {
        callback(result); //upload successful, returning
      });
      if(self.monitor) //start monitoring if the bool 'monitor' is true (defaults to false)
        console.log('Starting monitor ...');
        self.startMonitoring();
    }
  });
}

//Pipes uploadPipe to self.location (Google's Location header)
resumableUpload.prototype.putUpload = function(callback) {
  var self = this;
  var options = {
      url: self.location, //self.location becomes the Google-provided URL to PUT to
      headers: {
        'Authorization': 'Bearer ' + self.tokens.access_token,
        'Content-Length': fs.statSync(self.filepath).size - self.byteCount,
        'Content-Type': 'video/*'
      }
  };
  try {
    //creates file stream, pipes it to self.location
    var uploadPipe = fs.createReadStream(self.filepath, {start: self.byteCount, end: fs.statSync(self.filepath).size });
    uploadPipe.pipe(request.put(options, function(error, response, body) {
      if(!error) {
        callback(body);
      } else {
        self.getProgress();
        self.initUpload();
      }
    })); //piping is here, handles the request callback
    uploadPipe.on('error', function() {});
    uploadPipe.on('close', function() {});
  } catch(e) {
    console.log(e.printStackTrace());
    //Restart upload();
    self.getProgress();
    self.initUpload();
  }
}

//PUT every 5 seconds to get partial # of bytes uploaded
resumableUpload.prototype.startMonitoring = function() {
  var self = this;
  var options = {
    url: self.location,
    headers: {
      'Authorization': 'Bearer ' + self.tokens.access_token,
      'Content-Length': 0,
      'Content-Range': 'bytes */' + fs.statSync(this.filepath).size
    }
  };
  var healthCheck = function() { //Get # of bytes uploaded
    request.put(options, function(error, response, body) {
      if(!error && response.headers.range != undefined) {
        console.log('Progress: ' + response.headers.range.substring(8, response.headers.range.length) + '/' + fs.statSync(self.filepath).size);
        if(response.headers.range == fs.statSync(self.filepath).size) {
          clearInterval(healthCheckInteral);
        }
      }
    });
  };
  var healthCheckInterval = setInterval(healthCheck, 5000);
}

//If an upload fails, get partial # of bytes. Called by putUpload()
resumableUpload.prototype.getProgress = function() {
  var self = this;
  var options = {
    url: self.location,
    headers: {
      'Authorization': 'Bearer ' + self.tokens.access_token,
      'Content-Length': 0,
      'Content-Range': 'bytes */' + fs.statSync(this.filepath).size
    }
  };
  request.put(options, function(error, response, body) {
    try {
      self.byteCount = response.headers.range.substring(8, response.headers.range.length); //parse response
    } catch(e) {
      console.log('error');
    }
  });
}

module.exports = resumableUpload;