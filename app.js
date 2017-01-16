process.env.GOPATH = __dirname;

var hfc = require('hfc');
var util = require('util');
var fs = require('fs');
const https = require('https');
var express = require('express');
var app = express();
var path = require('path');
var ejs = require('ejs');
var nombreProf;


var chain;
var network;
var certPath;
var peers;
var users;
var userObj;
var chaincodeID;
var certFile = 'us.blockchain.ibm.com.cert';
var chaincodeIDPath = __dirname + "/chaincodeID";

var caUrl;
var peerUrls = [];
var EventUrls = [];

var chainName;
var chaincodePath;
var network_id;

var argumentosInicio;
var turnos;

app.get('/', function (req, res) {
	
	try {
        argumentosInicio = JSON.parse(fs.readFileSync(__dirname + '/argumentosInicio.json', 'utf8'));
    } catch (err) {
        console.log("argumentosInicio.json is missing or invalid file, Rerun the program with right file");
        process.exit();
    }

    try {
        turnos = JSON.parse(fs.readFileSync(__dirname + '/turnos.json', 'utf8'));
    } catch (err) {
        console.log("turnos.json is missing or invalid file, Rerun the program with right file");
        process.exit();
    }

	chainName = "Tutorias";
	try{
	//Create a client blockchain
	chain = hfc.newChain(chainName);
	} catch (err) {
		console.log("Chain "+ chainName + " ya existe");
	}
	//path to copy the certificate
	chaincodePath = "chaincode";
	certPath = __dirname + "/src/" + chaincodePath + "/certificate.pem";

	//read and process the credentials.json
	try {
        network = JSON.parse(fs.readFileSync(__dirname + '/ServiceCredentials.json', 'utf8'));
        if (network.credentials) network = network.credentials;
    } catch (err) {
        console.log("ServiceCredentials.json is missing or invalid file, Rerun the program with right file");
        process.exit();
    }

    peers = network.peers;
    users = network.users;

    network_id = Object.keys(network.ca);
    caUrl = "grpcs://" + network.ca[network_id].discovery_host + ":" + network.ca[network_id].discovery_port;
    var uuid = network_id[0].substring(0,8);
    chain.setKeyValStore(hfc.newFileKeyValStore(__dirname + '/keyValStore-' + uuid));
    fs.createReadStream(certFile).pipe(fs.createWriteStream(certPath));
    var cert =fs.readFileSync(certFile);
    chain.setMemberServicesUrl(caUrl, {
    	pem:cert
    });

    peerUrls = [];
    eventUrls = [];

    // Adding all the peers to blockchain
    // this adds high availability for the client
    for (var i = 0; i < peers.length; i++) {
        // Peers on Bluemix require secured connections, hence 'grpcs://'
        peerUrls.push("grpcs://" + peers[i].discovery_host + ":" + peers[i].discovery_port);
        chain.addPeer(peerUrls[i], {
            pem: cert
        });
        eventUrls.push("grpcs://" + peers[i].event_host + ":" + peers[i].event_port);
        chain.eventHubConnect(eventUrls[0], {
            pem: cert
        });
    }

    // Make sure disconnect the eventhub on exit
    process.on('exit', function() {
        chain.eventHubDisconnect();
    });

    //Print network details
    printNetworkDetails();

    res.sendFile(path.join(__dirname + '/index.html'));
});

function printNetworkDetails() {
    console.log("\n------------- ca-server, peers and event URL:PORT information: -------------");
    console.log("\nCA server Url : %s\n", caUrl);
    for (var i = 0; i < peerUrls.length; i++) {
        console.log("Validating Peer%d : %s", i, peerUrls[i]);
    }
    console.log("");
    for (var i = 0; i < eventUrls.length; i++) {
        console.log("Event Url on Peer%d : %s", i, eventUrls[i]);
    }
    console.log("");
    console.log('-----------------------------------------------------------\n');
}

app.get('/nuevoProfesor', function (req, res) {

	nombreProf = req.query.nombre + ", " + req.query.despacho;
    // Enroll a 'admin' who is already registered because it is
    // listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
    chain.enroll(users[0].enrollId, users[0].enrollSecret, function(err, admin) {
        if (err) throw Error("\nERROR: failed to enroll admin : " + err);

        console.log("\nEnrolled admin sucecssfully");

        // Set this user as the chain's registrar which is authorized to register other users.
        chain.setRegistrar(admin);

        //creating a new user
        var registrationRequest = {
            enrollmentID: nombreProf,
            affiliation: "group1"
        };
        chain.registerAndEnroll(registrationRequest, function(err, user) {
            if (err) throw Error(" Failed to register and enroll " + nombreProf + ": " + err);

            console.log("\nEnrolled and registered " + nombreProf + " successfully");
            userObj = user;
            //setting timers for fabric waits
            chain.setDeployWaitTime(120);
            console.log("\nDeploying chaincode ...");
            deployChaincode(req, res);
            
        });
    });

});

app.get('/actualizarTurno', function (req, res) {

    var args = [];
    args.push(req.query.turno);
    args.push(req.query.turnoVal);
    
    var eh = chain.getEventHub();
    // Construct the invoke request
    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: "invoke",
        // Parameters for the invoke function
        args: args
    };

    // Trigger the invoke transaction
    var invokeTx = userObj.invoke(invokeRequest);

    // Print the invoke results
    invokeTx.on('submitted', function(results) {
        // Invoke transaction submitted successfully
        console.log(util.format("\nSuccessfully submitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
    });
    invokeTx.on('complete', function(results) {
        // Invoke transaction completed successfully
        console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
        query(req,res);
    });
    invokeTx.on('error', function(err) {
        // Invoke transaction submission failed
        console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
        process.exit(1);
    });

    //Listen to custom events
    var regid = eh.registerChaincodeEvent(chaincodeID, "evtsender", function(event) {
        console.log(util.format("Custom event received, payload: %j\n", event.payload.toString()));
        eh.unregisterChaincodeEvent(regid);
    });

});

function deployChaincode(req, res) {
    var args = getArgs(argumentosInicio);

    // Construct the deploy request
    var deployRequest = {
        // Function to trigger
        fcn: "init",
        // Arguments to the initializing function
        args: args,
        chaincodePath: chaincodePath,
        // the location where the startup and HSBN store the certificates
        certificatePath: network.cert_path
    };

    // Trigger the deploy transaction
    var deployTx = userObj.deploy(deployRequest);

    // Print the deploy results
    deployTx.on('complete', function(results) {
        // Deploy request completed successfully
        chaincodeID = results.chaincodeID;
        console.log("\nChaincode ID : " + chaincodeID);
        console.log(util.format("\nSuccessfully deployed chaincode: request=%j, response=%j", deployRequest, results));
        // Save the chaincodeID
        fs.writeFileSync(chaincodeIDPath, chaincodeID);

        query(req, res);

    });

    deployTx.on('error', function(err) {
        // Deploy request failed
        console.log(util.format("\nFailed to deploy chaincode: request=%j, error=%j", deployRequest, err));
        process.exit(1);
    });

}

function query(req, res) {
    
    var args = getArgs(turnos);
    var turnosVal = [];

    var arg0 = [];
    arg0.push(args[0]);
    var queryRequest0 = {
        // Name (hash) required for query
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: "query",
        // Existing state variable to retrieve
        args: arg0
    };
    var queryTx0 = userObj.query(queryRequest0);
    // Print the query results
    queryTx0.on('complete', function(results) {
        // Query completed successfully
        //turnosVal[i] = results.result.toString();
        turnosVal.push(results.result.toString());
        console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest0, results.result.toString());

        var arg1 = [];
        arg1.push(args[1]);
        var queryRequest1 = {
            // Name (hash) required for query
            chaincodeID: chaincodeID,
            // Function to trigger
            fcn: "query",
            // Existing state variable to retrieve
            args: arg1
        };
        var queryTx1 = userObj.query(queryRequest1);
        // Print the query results
        queryTx1.on('complete', function(results) {
            // Query completed successfully
            //turnosVal[i] = results.result.toString();
            turnosVal.push(results.result.toString());
            console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest1, results.result.toString());

            var arg2 = [];
            arg2.push(args[2]);
            var queryRequest2 = {
                // Name (hash) required for query
                chaincodeID: chaincodeID,
                // Function to trigger
                fcn: "query",
                // Existing state variable to retrieve
                args: arg2
            };
            var queryTx2 = userObj.query(queryRequest2);
            // Print the query results
            queryTx2.on('complete', function(results) {
                // Query completed successfully
                //turnosVal[i] = results.result.toString();
                turnosVal.push(results.result.toString());
                console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest2, results.result.toString());

                var arg3 = [];
                arg3.push(args[3]);
                var queryRequest3 = {
                    // Name (hash) required for query
                    chaincodeID: chaincodeID,
                    // Function to trigger
                    fcn: "query",
                    // Existing state variable to retrieve
                    args: arg3
                };
                var queryTx3 = userObj.query(queryRequest3);
                // Print the query results
                queryTx3.on('complete', function(results) {
                    // Query completed successfully
                    //turnosVal[i] = results.result.toString();
                    turnosVal.push(results.result.toString());
                    console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest3, results.result.toString());

                    var arg4 = [];
                    arg4.push(args[4]);
                    var queryRequest4 = {
                        // Name (hash) required for query
                        chaincodeID: chaincodeID,
                        // Function to trigger
                        fcn: "query",
                        // Existing state variable to retrieve
                        args: arg4
                    };
                    var queryTx4 = userObj.query(queryRequest4);
                    // Print the query results
                    queryTx4.on('complete', function(results) {
                        // Query completed successfully
                        //turnosVal[i] = results.result.toString();
                        turnosVal.push(results.result.toString());
                        console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest4, results.result.toString());

                        var arg5 = [];
                        arg5.push(args[5]);
                        var queryRequest5 = {
                        // Name (hash) required for query
                            chaincodeID: chaincodeID,
                            // Function to trigger
                            fcn: "query",
                            // Existing state variable to retrieve
                            args: arg5
                        };
                        var queryTx5 = userObj.query(queryRequest5);
                        // Print the query results
                        queryTx5.on('complete', function(results) {
                            // Query completed successfully
                            //turnosVal[i] = results.result.toString();
                            turnosVal.push(results.result.toString());
                            console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest5, results.result.toString());

                            var arg6 = [];
                            arg6.push(args[6]);
                            var queryRequest6 = {
                                // Name (hash) required for query
                                chaincodeID: chaincodeID,
                                // Function to trigger
                                fcn: "query",
                                // Existing state variable to retrieve
                                args: arg6
                            };
                            var queryTx6 = userObj.query(queryRequest6);
                            // Print the query results
                            queryTx6.on('complete', function(results) {
                                // Query completed successfully
                                //turnosVal[i] = results.result.toString();
                                turnosVal.push(results.result.toString());
                                console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest6, results.result.toString());

                                var arg7 = [];
                                arg7.push(args[7]);
                                var queryRequest7 = {
                                    // Name (hash) required for query
                                    chaincodeID: chaincodeID,
                                    // Function to trigger
                                    fcn: "query",
                                    // Existing state variable to retrieve
                                    args: arg7
                                };
                                var queryTx7 = userObj.query(queryRequest7);
                                // Print the query results
                                queryTx7.on('complete', function(results) {
                                    // Query completed successfully
                                    //turnosVal[i] = results.result.toString();
                                    turnosVal.push(results.result.toString());
                                    console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest7, results.result.toString());

                                    var arg8 = [];
                                    arg8.push(args[8]);
                                    var queryRequest8 = {
                                        // Name (hash) required for query
                                        chaincodeID: chaincodeID,
                                        // Function to trigger
                                        fcn: "query",
                                        // Existing state variable to retrieve
                                        args: arg8
                                    };
                                    var queryTx8 = userObj.query(queryRequest8);
                                    // Print the query results
                                    queryTx8.on('complete', function(results) {
                                        // Query completed successfully
                                        //turnosVal[i] = results.result.toString();
                                        turnosVal.push(results.result.toString());
                                        console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest8, results.result.toString());

                                        var arg9 = [];
                                        arg9.push(args[9]);
                                        var queryRequest9 = {
                                            // Name (hash) required for query
                                            chaincodeID: chaincodeID,
                                            // Function to trigger
                                            fcn: "query",
                                            // Existing state variable to retrieve
                                            args: arg9
                                        };
                                        var queryTx9 = userObj.query(queryRequest9);
                                        // Print the query results
                                        queryTx9.on('complete', function(results) {
                                            // Query completed successfully
                                            //turnosVal[i] = results.result.toString();
                                            turnosVal.push(results.result.toString());
                                            console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest9, results.result.toString());

                                            var arg10 = [];
                                            arg10.push(args[10]);
                                            var queryRequest10 = {
                                                // Name (hash) required for query
                                                chaincodeID: chaincodeID,
                                                // Function to trigger
                                                fcn: "query",
                                                // Existing state variable to retrieve
                                                args: arg10
                                            };
                                            var queryTx10 = userObj.query(queryRequest10);
                                            // Print the query results
                                            queryTx10.on('complete', function(results) {
                                                // Query completed successfully
                                                //turnosVal[i] = results.result.toString();
                                                turnosVal.push(results.result.toString());
                                                console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest10, results.result.toString());

                                                var arg11 = [];
                                                arg11.push(args[11]);
                                                var queryRequest11 = {
                                                    // Name (hash) required for query
                                                    chaincodeID: chaincodeID,
                                                    // Function to trigger
                                                    fcn: "query",
                                                    // Existing state variable to retrieve
                                                    args: arg11
                                                };
                                                var queryTx11 = userObj.query(queryRequest11);
                                                // Print the query results
                                                queryTx11.on('complete', function(results) {
                                                    // Query completed successfully
                                                    //turnosVal[i] = results.result.toString();
                                                    turnosVal.push(results.result.toString());
                                                    console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest11, results.result.toString());

                                                    var arg12 = [];
                                                    arg12.push(args[12]);
                                                    var queryRequest12 = {
                                                        // Name (hash) required for query
                                                        chaincodeID: chaincodeID,
                                                        // Function to trigger
                                                        fcn: "query",
                                                        // Existing state variable to retrieve
                                                        args: arg12
                                                    };
                                                    var queryTx12 = userObj.query(queryRequest12);
                                                    // Print the query results
                                                    queryTx12.on('complete', function(results) {
                                                        // Query completed successfully
                                                        //turnosVal[i] = results.result.toString();
                                                        turnosVal.push(results.result.toString());
                                                        console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest12, results.result.toString());

                                                        var arg13 = [];
                                                        arg13.push(args[13]);
                                                        var queryRequest13 = {
                                                            // Name (hash) required for query
                                                            chaincodeID: chaincodeID,
                                                            // Function to trigger
                                                            fcn: "query",
                                                            // Existing state variable to retrieve
                                                            args: arg13
                                                        };
                                                        var queryTx13 = userObj.query(queryRequest13);
                                                        // Print the query results
                                                        queryTx13.on('complete', function(results) {
                                                            // Query completed successfully
                                                            turnosVal.push(results.result.toString());
                                                            console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest13, results.result.toString());

                                                            var arg14 = [];
                                                            arg14.push(args[14]);
                                                            var queryRequest14 = {
                                                                // Name (hash) required for query
                                                                chaincodeID: chaincodeID,
                                                                // Function to trigger
                                                                fcn: "query",
                                                                // Existing state variable to retrieve
                                                                args: arg14
                                                            };
                                                            var queryTx14 = userObj.query(queryRequest14);
                                                            // Print the query results
                                                            queryTx14.on('complete', function(results) {
                                                                // Query completed successfully
                                                                //turnosVal[i] = results.result.toString();
                                                                turnosVal.push(results.result.toString());
                                                                console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest14, results.result.toString());

                                                                var arg15 = [];
                                                                arg15.push(args[15]);
                                                                var queryRequest15 = {
                                                                    // Name (hash) required for query
                                                                    chaincodeID: chaincodeID,
                                                                    // Function to trigger
                                                                    fcn: "query",
                                                                    // Existing state variable to retrieve
                                                                    args: arg15
                                                                };
                                                                var queryTx15 = userObj.query(queryRequest15);
                                                                // Print the query results
                                                                queryTx15.on('complete', function(results) {
                                                                    // Query completed successfully
                                                                    //turnosVal[i] = results.result.toString();
                                                                    turnosVal.push(results.result.toString());
                                                                    console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest15, results.result.toString());

                                                                    var arg16 = [];
                                                                    arg16.push(args[16]);
                                                                    var queryRequest16 = {
                                                                        // Name (hash) required for query
                                                                        chaincodeID: chaincodeID,
                                                                        // Function to trigger
                                                                        fcn: "query",
                                                                        // Existing state variable to retrieve
                                                                        args: arg16
                                                                    };
                                                                    var queryTx16 = userObj.query(queryRequest16);
                                                                    // Print the query results
                                                                    queryTx16.on('complete', function(results) {
                                                                        // Query completed successfully
                                                                        //turnosVal[i] = results.result.toString();
                                                                        turnosVal.push(results.result.toString());
                                                                        console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest16, results.result.toString());

                                                                        var arg17 = [];
                                                                        arg17.push(args[17]);
                                                                        var queryRequest17 = {
                                                                            // Name (hash) required for query
                                                                            chaincodeID: chaincodeID,
                                                                            // Function to trigger
                                                                            fcn: "query",
                                                                            // Existing state variable to retrieve
                                                                            args: arg17
                                                                        };
                                                                        var queryTx17 = userObj.query(queryRequest17);
                                                                        // Print the query results
                                                                        queryTx17.on('complete', function(results) {
                                                                            // Query completed successfully
                                                                            //turnosVal[i] = results.result.toString();
                                                                            turnosVal.push(results.result.toString());
                                                                            console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest17, results.result.toString());

                                                                            var arg18 = [];
                                                                            arg18.push(args[18]);
                                                                            var queryRequest18 = {
                                                                                // Name (hash) required for query
                                                                                chaincodeID: chaincodeID,
                                                                                // Function to trigger
                                                                                fcn: "query",
                                                                                // Existing state variable to retrieve
                                                                                args: arg18
                                                                            };
                                                                            var queryTx18 = userObj.query(queryRequest18);
                                                                            // Print the query results
                                                                            queryTx18.on('complete', function(results) {
                                                                                // Query completed successfully
                                                                                //turnosVal[i] = results.result.toString();
                                                                                turnosVal.push(results.result.toString());
                                                                                console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest18, results.result.toString());

                                                                                var arg19 = [];
                                                                                arg19.push(args[19]);
                                                                                var queryRequest19 = {
                                                                                    // Name (hash) required for query
                                                                                    chaincodeID: chaincodeID,
                                                                                    // Function to trigger
                                                                                    fcn: "query",
                                                                                    // Existing state variable to retrieve
                                                                                    args: arg19
                                                                                };
                                                                                var queryTx19 = userObj.query(queryRequest19);
                                                                                // Print the query results
                                                                                queryTx19.on('complete', function(results) {
                                                                                    // Query completed successfully
                                                                                    //turnosVal[i] = results.result.toString();
                                                                                    turnosVal.push(results.result.toString());
                                                                                    console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest19, results.result.toString());

                                                                                    console.log(turnosVal);

                                                                                    renderiza(turnosVal,req,res);

                                                                            //FIN19
                                                                                    //process.exit(0);
                                                                                });
                                                                                queryTx19.on('error', function(err) {
                                                                                    // Query failed
                                                                                    console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest19, err);
                                                                                    process.exit(1);
                                                                                });
                                                                        //FIN18
                                                                                //process.exit(0);
                                                                            });
                                                                            queryTx18.on('error', function(err) {
                                                                                // Query failed
                                                                                console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest18, err);
                                                                                process.exit(1);
                                                                            });
                                                                    //FIN17
                                                                            //process.exit(0);
                                                                        });
                                                                        queryTx17.on('error', function(err) {
                                                                            // Query failed
                                                                            console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest17, err);
                                                                            process.exit(1);
                                                                        });
                                                                //FIN 16
                                                                        //process.exit(0);
                                                                    });
                                                                    queryTx16.on('error', function(err) {
                                                                        // Query failed
                                                                        console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest16, err);
                                                                        process.exit(1);
                                                                    });
                                                            //FIN 15
                                                                    //process.exit(0);
                                                                });
                                                                queryTx15.on('error', function(err) {
                                                                    // Query failed
                                                                    console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest15, err);
                                                                    process.exit(1);
                                                                });
                                                        //FIN14
                                                                //process.exit(0);
                                                            });
                                                            queryTx14.on('error', function(err) {
                                                                // Query failed
                                                                console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest14, err);
                                                                process.exit(1);
                                                            });
                                                    //FIN13
                                                            //process.exit(0);
                                                        });
                                                        queryTx13.on('error', function(err) {
                                                            // Query failed
                                                            console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest13, err);
                                                            process.exit(1);
                                                        });
                                                //FIN12
                                                        //process.exit(0);
                                                    });
                                                    queryTx12.on('error', function(err) {
                                                        // Query failed
                                                        console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest12, err);
                                                        process.exit(1);
                                                    });
                                            //FIN 11
                                                    //process.exit(0);
                                                });
                                                queryTx11.on('error', function(err) {
                                                    // Query failed
                                                    console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest11, err);
                                                    process.exit(1);
                                                });
                                        //FIN 10
                                                //process.exit(0);
                                            });
                                            queryTx10.on('error', function(err) {
                                                // Query failed
                                                console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest10, err);
                                                process.exit(1);
                                            });

                                    //FIN9
                                            //process.exit(0);
                                        });
                                        queryTx9.on('error', function(err) {
                                            // Query failed
                                            console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest9, err);
                                            process.exit(1);
                                        });
                                //FIN8
                                        //process.exit(0);
                                    });
                                    queryTx8.on('error', function(err) {
                                        // Query failed
                                        console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest8, err);
                                        process.exit(1);
                                    });
                            //FIN7
                                    //process.exit(0);
                                });
                                queryTx7.on('error', function(err) {
                                    // Query failed
                                    console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest7, err);
                                    process.exit(1);
                                });
                        //FIN 6
                                //process.exit(0);
                            });
                            queryTx6.on('error', function(err) {
                                // Query failed
                                console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest6, err);
                                process.exit(1);
                            });
                    //FIN 5
                            //process.exit(0);
                        });
                        queryTx5.on('error', function(err) {
                            // Query failed
                            console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest5, err);
                            process.exit(1);
                        });

                        //FIN4
                        //process.exit(0);
                    });
                    queryTx4.on('error', function(err) {
                        // Query failed
                        console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest4, err);
                        process.exit(1);
                    });
                //FIN3
                    //process.exit(0);
                });
                queryTx3.on('error', function(err) {
                    // Query failed
                    console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest3, err);
                    process.exit(1);
                });
        //FIN2
                //process.exit(0);
            });
            queryTx2.on('error', function(err) {
                // Query failed
                console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest2, err);
                process.exit(1);
            });
    //FIN 1
            //process.exit(0);
        });
        queryTx1.on('error', function(err) {
            // Query failed
            console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest1, err);
            process.exit(1);
        });
//FIN 0
        //process.exit(0);
    });
    queryTx0.on('error', function(err) {
        // Query failed
        console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest0, err);
        process.exit(1);
    });

}

function getArgs(request) {
    var args = [];
    for (var i = 0; i < request.args.length; i++) {
        args.push(request.args[i]);
    }
    return args;
}

function renderiza(turnosVal,req,res){
    fs.readFile('tabla.html', 'utf-8', function(err, content) {
        if (err) { 
            res.end('error ocurred');
            return;
        }
        var profesor = nombreProf;
        var l1val = turnosVal[0];
        var l2val = turnosVal[1];
        var l3val = turnosVal[2];
        var l4val = turnosVal[3];
        var m1val = turnosVal[4];
        var m2val = turnosVal[5];
        var m3val = turnosVal[6];
        var m4val = turnosVal[7];
        var x1val = turnosVal[8];
        var x2val = turnosVal[9];
        var x3val = turnosVal[10];
        var x4val = turnosVal[11];
        var j1val = turnosVal[12];
        var j2val = turnosVal[13];
        var j3val = turnosVal[14];
        var j4val = turnosVal[15];
        var v1val = turnosVal[16];
        var v2val = turnosVal[17];
        var v3val = turnosVal[18];
        var v4val = turnosVal[19];
        var renderedHtml = ejs.render(content,{
            profesor: profesor,
            l1val: l1val,
            l2val: l2val,
            l3val: l3val,
            l4val: l4val,
            m1val: m1val,
            m2val: m2val,
            m3val: m3val,
            m4val: m4val,
            x1val: x1val,
            x2val: x2val,
            x3val: x3val,
            x4val: x4val,
            j1val: j1val,
            j2val: j2val,
            j3val: j3val,
            j4val: j4val,
            v1val: v1val,
            v2val: v2val,
            v3val: v3val,
            v4val: v4val
        });
        res.end(renderedHtml);
    });
}

app.listen(3000, function () {
  console.log('Aplicación de gestión de tutorías escuchando en el puerto: 3000');
});