package main

import (
	"errors"
	"fmt"
	"strconv"

	"github.com/hyperledger/fabric/core/chaincode/shim"
)

// SimpleChaincode example simple Chaincode implementation
type SimpleChaincode struct {
}
var EVENT_COUNTER = "event_counter"
func (t *SimpleChaincode) Init(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	var l1, l2, l3, l4, m1, m2, m3, m4, x1, x2, x3, x4, j1, j2, j3, j4, v1, v2, v3, v4 string    // Entities
	var l1val, l2val, l3val, l4val, m1val, m2val, m3val, m4val, x1val, x2val, x3val, x4val, j1val, j2val, j3val, j4val, v1val, v2val, v3val, v4val string // Asset holdings
	var err error

	if len(args) != 40 {
		return nil, errors.New("Incorrect number of arguments. Expecting 40")
	}

	// Initialize the chaincode
	l1 = args[0]
	l1val = args[1]
	
	l2 = args[2]
	l2val = args[3]
	
	l3 = args[4]
	l3val = args[5]

	l4 = args[6]
	l4val = args[7]
	
	m1 = args[8]
	m1val = args[9]
	
	m2 = args[10]
	m2val = args[11]

	m3 = args[12]
	m3val = args[13]

	m4 = args[14]
	m4val = args[15]

	x1 = args[16]
	x1val = args[17]

	x2 = args[18]
	x2val = args[19]

	x3 = args[20]
	x3val = args[21]

	x4 = args[22]
	x4val = args[23]

	j1 = args[24]
	j1val = args[25]

	j2 = args[26]
	j2val = args[27]

	j3 = args[28]
	j3val = args[29]

	j4 = args[30]
	j4val = args[31]

	v1 = args[32]
	v1val = args[33]

	v2 = args[34]
	v2val = args[35]

	v3 = args[36]
	v3val = args[37]

	v4 = args[38]
	v4val = args[39]

	// Write the state to the ledger
	err = stub.PutState(l1, []byte(l1val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(l2, []byte(l2val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(l3, []byte(l3val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(l4, []byte(l4val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(m1, []byte(m1val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(m2, []byte(m2val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(m3, []byte(m3val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(m4, []byte(m4val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(x1, []byte(x1val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(x2, []byte(x2val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(x3, []byte(x3val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(x4, []byte(x4val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(j1, []byte(j1val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(j2, []byte(j2val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(j3, []byte(j3val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(j4, []byte(j4val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(v1, []byte(v1val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(v2, []byte(v2val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(v3, []byte(v3val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(v4, []byte(v4val))
	if err != nil {
		return nil, err
	}

	err = stub.PutState(EVENT_COUNTER, []byte("1"))
	if err != nil {
		return nil, err
	}
	return nil, nil
}

func (t *SimpleChaincode) Invoke(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	if function == "delete" {
		// Deletes an entity from its state
		return t.delete(stub, args)
	}

	var turno string    // Entities
	var turnoval string // Asset holdings
	var err error

	if len(args) != 2 {
		return nil, errors.New("Incorrect number of arguments. Expecting 2")
	}

	turno = args[0]
	turnoval = args[1]

	// Get the state from the ledger
	turnovalbytes, err := stub.GetState(turno)
	if err != nil {
		return nil, errors.New("Failed to get state")
	}
	if turnovalbytes == nil {
		return nil, errors.New("Entity not found")
	}

	// Perform the execution
	fmt.Printf("%s: %s\n", turno, turnoval)

	// Write the state back to the ledger
	err = stub.PutState(turno, []byte(turnoval))
	if err != nil {
		return nil, err
	}

	//Event based
        b, err := stub.GetState(EVENT_COUNTER)
	if err != nil {
		return nil, errors.New("Failed to get state")
	}
	noevts, _ := strconv.Atoi(string(b))

	tosend := "Event Counter is " + string(b)

	err = stub.PutState(EVENT_COUNTER, []byte(strconv.Itoa(noevts+1)))
	if err != nil {
		return nil, err
	}

	err = stub.SetEvent("evtsender", []byte(tosend))
	if err != nil {
		return nil, err
        }
	return nil, nil
}

// Deletes an entity from state
func (t *SimpleChaincode) delete(stub shim.ChaincodeStubInterface, args []string) ([]byte, error) {
	if len(args) != 1 {
		return nil, errors.New("Incorrect number of arguments. Expecting 1")
	}

	turno := args[0]

	// Delete the key from the state in ledger
	err := stub.DelState(turno)
	if err != nil {
		return nil, errors.New("Failed to delete state")
	}

	return nil, nil
}

// Query callback representing the query of a chaincode
func (t *SimpleChaincode) Query(stub shim.ChaincodeStubInterface, function string, args []string) ([]byte, error) {
	if function != "query" {
		return nil, errors.New("Invalid query function name. Expecting \"query\"")
	}
	var turno string // Entities
	var err error

	
	if len(args) != 1 {
		return nil, errors.New("Incorrect number of arguments. Expecting name of the turn to query")
	}
	
	turno = args[0]

	// Get the state from the ledger
	Avalbytes, err := stub.GetState(turno)
	if err != nil {
		jsonResp := "{\"Error\":\"Failed to get state for " + turno + "\"}"
		return nil, errors.New(jsonResp)
	}

	if Avalbytes == nil {
		jsonResp := "{\"Error\":\"Nil amount for " + turno + "\"}"
		return nil, errors.New(jsonResp)
	}

	jsonResp := "{\"Turno\":\"" + turno + "\",\"Alumno\":\"" + string(Avalbytes) + "\"}"
	fmt.Printf("Query Response:%s\n", jsonResp)
	return Avalbytes, nil
}

func main() {
	err := shim.Start(new(SimpleChaincode))
	if err != nil {
		fmt.Printf("Error starting Simple chaincode: %s", err)
	}
}
