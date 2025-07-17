module.exports = function(RED) {
    const {PythonShell} = require('python-shell');
    const path = require('path');
    const fs = require('fs');
    
    // Global variables to store ODrive instances
    let odriveInstances = {};
    
    // Helper function to execute Python code
    function executePython(code, callback) {
        const options = {
            mode: 'text',
            pythonOptions: ['-u'], // Unbuffered output
            scriptPath: __dirname,
            args: []
        };
        
        // Create a temporary Python file
        const tempFile = path.join(__dirname, `temp_${Date.now()}.py`);
        fs.writeFileSync(tempFile, code);
        
        PythonShell.run(path.basename(tempFile), options, function (err, results) {
            // Clean up temp file
            try {
                fs.unlinkSync(tempFile);
            } catch (e) {
                // Ignore cleanup errors
            }
            
            if (err) {
                callback(err.toString(), null);
            } else if (results && results.length > 0) {
                // Only use the first line of output (should be JSON)
                // Filter out any non-JSON lines
                const jsonLine = results.find(line => line.trim().startsWith('{'));
                callback(null, jsonLine || results[0]);
            } else {
                callback("No output from Python script", null);
            }
        });
    }
    
    // ODrive Connection Node
    function ODriveConnectionNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.status({fill: "yellow", shape: "ring", text: "disconnected"});
        
        node.on('input', function(msg) {
            const instanceId = config.instanceId || 'default';
            
            const pythonCode = `
import odrive
import json
import sys

try:
    odrv0 = odrive.find_any()
    result = {
        "status": "connected",
        "vbus_voltage": odrv0.vbus_voltage,
        "serial_number": hex(odrv0.serial_number) if hasattr(odrv0, 'serial_number') else "unknown"
    }
    print(json.dumps(result))
except Exception as e:
    result = {"status": "error", "error": str(e)}
    print(json.dumps(result))
`;
            
            executePython(pythonCode, (err, result) => {
                if (err) {
                    node.error("Failed to connect to ODrive: " + err);
                    node.status({fill: "red", shape: "ring", text: "error"});
                    msg.payload = { error: err };
                } else {
                    try {
                        const data = JSON.parse(result);
                        if (data.status === "connected") {
                            odriveInstances[instanceId] = true;
                            node.status({fill: "green", shape: "dot", text: "connected"});
                            msg.payload = data;
                        } else {
                            node.status({fill: "red", shape: "ring", text: "error"});
                            msg.payload = data;
                        }
                    } catch (e) {
                        node.error("Failed to parse response: " + e);
                        node.status({fill: "red", shape: "ring", text: "parse error"});
                        msg.payload = { 
                            error: e.toString(),
                            raw_output: result 
                        };
                    }
                }
                node.send(msg);
            });
        });
    }
    
    // ODrive Configuration Node
    function ODriveConfigNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.on('input', function(msg) {
            const instanceId = config.instanceId || 'default';
            
            // Get configuration parameters from node config or msg
            const dcBusOvervoltage = config.dcBusOvervoltage || msg.dcBusOvervoltage || 26;
            const dcBusUndervoltage = config.dcBusUndervoltage || msg.dcBusUndervoltage || 20;
            const dcMaxPositiveCurrent = config.dcMaxPositiveCurrent || msg.dcMaxPositiveCurrent || 10;
            const dcMaxNegativeCurrent = config.dcMaxNegativeCurrent || msg.dcMaxNegativeCurrent || -10;
            const motorType = config.motorType || msg.motorType || "HIGH_CURRENT";
            const torqueConstant = config.torqueConstant || msg.torqueConstant || 0.02506060606060606;
            const polePairs = config.polePairs || msg.polePairs || 7;
            const currentSoftMax = config.currentSoftMax || msg.currentSoftMax || 40;
            const currentHardMax = config.currentHardMax || msg.currentHardMax || 60;
            const calibrationCurrent = config.calibrationCurrent || msg.calibrationCurrent || 10;
            const resistanceCalibMaxVoltage = config.resistanceCalibMaxVoltage || msg.resistanceCalibMaxVoltage || 2;
            const torqueSoftMin = config.torqueSoftMin || msg.torqueSoftMin || -0.2004848484848485;
            const torqueSoftMax = config.torqueSoftMax || msg.torqueSoftMax || 0.2004848484848485;
            const velGain = config.velGain || msg.velGain || 0.167;
            
            const pythonCode = `
import odrive
import json
import sys
from odrive.enums import MotorType, InputMode, ControlMode, Protocol

try:
    odrv0 = odrive.find_any()
    
    # Configure ODrive
    odrv0.config.dc_bus_overvoltage_trip_level = ${dcBusOvervoltage}
    odrv0.config.dc_bus_undervoltage_trip_level = ${dcBusUndervoltage}
    odrv0.config.dc_max_positive_current = ${dcMaxPositiveCurrent}
    odrv0.config.dc_max_negative_current = ${dcMaxNegativeCurrent}
    
    # Configure motor
    odrv0.axis0.config.motor.motor_type = MotorType.${motorType}
    odrv0.axis0.config.motor.torque_constant = ${torqueConstant}
    odrv0.axis0.config.motor.pole_pairs = ${polePairs}
    odrv0.axis0.config.motor.current_soft_max = ${currentSoftMax}
    odrv0.axis0.config.motor.current_hard_max = ${currentHardMax}
    odrv0.axis0.config.motor.calibration_current = ${calibrationCurrent}
    odrv0.axis0.config.motor.resistance_calib_max_voltage = ${resistanceCalibMaxVoltage}
    
    # Try to set calibration lockin current if it exists
    if hasattr(odrv0.axis0.config, 'calibration_lockin'):
        odrv0.axis0.config.calibration_lockin.current = ${calibrationCurrent}
    
    # Configure controller
    odrv0.axis0.controller.config.input_mode = InputMode.PASSTHROUGH
    odrv0.axis0.controller.config.control_mode = ControlMode.POSITION_CONTROL
    odrv0.axis0.config.torque_soft_min = ${torqueSoftMin}
    odrv0.axis0.config.torque_soft_max = ${torqueSoftMax}
    odrv0.axis0.controller.config.vel_gain = ${velGain}
    
    # Configure communication
    if hasattr(odrv0, 'can'):
        odrv0.can.config.protocol = Protocol.NONE
    odrv0.config.enable_uart_a = False
    
    # Configure encoder only if RS485 encoder exists
    if hasattr(odrv0, 'rs485_encoder_group0'):
        try:
            from odrive.enums import Rs485EncoderMode, EncoderId
            odrv0.rs485_encoder_group0.config.mode = Rs485EncoderMode.AMT21_EVENT_DRIVEN
            odrv0.axis0.config.load_encoder = EncoderId.RS485_ENCODER0
            odrv0.axis0.config.commutation_encoder = EncoderId.RS485_ENCODER0
        except:
            pass  # Skip RS485 encoder config if not available
    
    result = {"status": "configured", "vbus_voltage": odrv0.vbus_voltage}
    print(json.dumps(result))
except Exception as e:
    result = {"status": "error", "error": str(e)}
    print(json.dumps(result))
`;
            
            executePython(pythonCode, (err, result) => {
                if (err) {
                    node.error("Failed to configure ODrive: " + err);
                    msg.payload = { error: err };
                } else {
                    try {
                        msg.payload = JSON.parse(result);
                    } catch (e) {
                        node.error("Failed to parse response: " + e);
                        msg.payload = { 
                            error: e.toString(),
                            raw_output: result 
                        };
                    }
                }
                node.send(msg);
            });
        });
    }
    
    // ODrive Motor Control Node
    function ODriveMotorControlNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.on('input', function(msg) {
            const instanceId = config.instanceId || 'default';
            const controlMode = config.controlMode || msg.controlMode || 'position';
            const value = config.value || msg.value || 0;
            const velRampRate = config.velRampRate || msg.velRampRate || 16.67;
            const velLimit = config.velLimit || msg.velLimit || 10;
            
            let pythonCode = '';
            
            if (controlMode === 'position') {
                pythonCode = `
import odrive
import json
import sys
from odrive.enums import InputMode, ControlMode, AxisState

try:
    odrv0 = odrive.find_any()
    
    # Ensure motor is in CLOSED_LOOP_CONTROL state
    if odrv0.axis0.current_state != AxisState.CLOSED_LOOP_CONTROL:
        # Try to enter closed loop control
        odrv0.axis0.requested_state = AxisState.CLOSED_LOOP_CONTROL
        import time
        time.sleep(0.5)  # Give it time to enter the state
    
    # Set up position control
    odrv0.axis0.controller.config.control_mode = ControlMode.POSITION_CONTROL
    odrv0.axis0.controller.config.input_mode = InputMode.PASSTHROUGH
    odrv0.axis0.controller.config.circular_setpoints = True
    odrv0.axis0.controller.config.vel_limit = ${velLimit}
    
    # Enable position mapper if available
    if hasattr(odrv0.axis0, 'pos_vel_mapper'):
        odrv0.axis0.pos_vel_mapper.config.offset_valid = True
    
    # Set position (input is in turns: 0 = 0°, 0.5 = 180°, 1 = 360°)
    odrv0.axis0.controller.input_pos = ${value}
    
    # Wait a moment for the position to be set
    import time
    time.sleep(0.1)
    
    # Get actual position safely
    actual_position = 0
    try:
        if hasattr(odrv0.axis0, 'pos_vel_mapper'):
            actual_position = odrv0.axis0.pos_vel_mapper.pos_rel
        elif hasattr(odrv0.axis0, 'encoder'):
            actual_position = odrv0.axis0.encoder.pos_estimate
        else:
            # Fallback to input position
            actual_position = odrv0.axis0.controller.input_pos
    except:
        actual_position = ${value}
    
    result = {
        "status": "success",
        "mode": "position",
        "target_position": ${value},
        "actual_position": actual_position,
        "axis_state": odrv0.axis0.current_state,
        "control_mode": odrv0.axis0.controller.config.control_mode
    }
    print(json.dumps(result))
except Exception as e:
    result = {"status": "error", "error": str(e)}
    print(json.dumps(result))
`;
            } else if (controlMode === 'velocity') {
                pythonCode = `
import odrive
import json
import sys
from odrive.enums import InputMode, ControlMode

try:
    odrv0 = odrive.find_any()
    
    # Set up velocity control
    odrv0.axis0.controller.config.vel_ramp_rate = ${velRampRate}
    odrv0.axis0.controller.config.control_mode = ControlMode.VELOCITY_CONTROL
    odrv0.axis0.controller.config.input_mode = InputMode.VEL_RAMP
    odrv0.axis0.controller.config.vel_limit = 90
    
    # Set velocity
    odrv0.axis0.controller.input_vel = ${value}
    
    # Get actual velocity safely
    actual_velocity = 0
    if hasattr(odrv0.axis0, 'pos_vel_mapper'):
        actual_velocity = getattr(odrv0.axis0.pos_vel_mapper, 'vel', 0)
    elif hasattr(odrv0.axis0, 'encoder'):
        actual_velocity = getattr(odrv0.axis0.encoder, 'vel_estimate', 0)
    
    result = {
        "status": "success",
        "mode": "velocity",
        "target_velocity": ${value},
        "actual_velocity": actual_velocity
    }
    print(json.dumps(result))
except Exception as e:
    result = {"status": "error", "error": str(e)}
    print(json.dumps(result))
`;
            }
            
            executePython(pythonCode, (err, result) => {
                if (err) {
                    node.error("Failed to control motor: " + err);
                    msg.payload = { error: err };
                } else {
                    try {
                        msg.payload = JSON.parse(result);
                    } catch (e) {
                        node.error("Failed to parse response: " + e);
                        msg.payload = { 
                            error: e.toString(),
                            raw_output: result 
                        };
                    }
                }
                node.send(msg);
            });
        });
    }
    
    // ODrive Spin Coater Node
    function ODriveSpinCoaterNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.on('input', function(msg) {
            const instanceId = config.instanceId || 'default';
            const motorRpm = config.motorRpm || msg.motorRpm || 1500;
            const acceleration = config.acceleration || msg.acceleration || 16.67;
            const spinTime = config.spinTime || msg.spinTime || 40;
            
            const odriveRevs = motorRpm / 60;
            
            const pythonCode = `
import odrive
import time
import json
import sys
from odrive.enums import InputMode, ControlMode, AxisState

try:
    odrv0 = odrive.find_any()
    
    # Configure for velocity control
    odrv0.axis0.controller.config.vel_ramp_rate = ${acceleration}
    odrv0.axis0.controller.config.control_mode = ControlMode.VELOCITY_CONTROL
    odrv0.axis0.controller.config.input_mode = InputMode.VEL_RAMP
    odrv0.axis0.controller.config.vel_limit = 90
    
    # Start spinning
    odrv0.axis0.controller.input_vel = ${odriveRevs}
    
    # Wait for spin time
    time.sleep(${spinTime})
    
    # Stop spinning
    odrv0.axis0.controller.input_vel = 0
    
    # Wait for motor to stop
    time.sleep(2)
    
    # Return to position control mode
    odrv0.axis0.controller.config.control_mode = ControlMode.POSITION_CONTROL
    odrv0.axis0.controller.config.input_mode = InputMode.PASSTHROUGH
    odrv0.axis0.controller.config.circular_setpoints = True
    odrv0.axis0.controller.config.vel_limit = 10
    
    # Only set pos_vel_mapper if it exists
    if hasattr(odrv0.axis0, 'pos_vel_mapper'):
        odrv0.axis0.pos_vel_mapper.config.offset_valid = True
    
    # Make sure we're in closed loop control
    if odrv0.axis0.current_state != AxisState.CLOSED_LOOP_CONTROL:
        odrv0.axis0.requested_state = AxisState.CLOSED_LOOP_CONTROL
        time.sleep(0.5)
    
    # Return to home position
    odrv0.axis0.controller.input_pos = 1
    
    result = {
        "status": "complete",
        "rpm": ${motorRpm},
        "spin_time": ${spinTime}
    }
    print(json.dumps(result))
except Exception as e:
    result = {"status": "error", "error": str(e)}
    print(json.dumps(result))
`;
            
            node.status({fill: "blue", shape: "dot", text: "spinning..."});
            
            executePython(pythonCode, (err, result) => {
                if (err) {
                    node.error("Spin coating failed: " + err);
                    node.status({fill: "red", shape: "ring", text: "error"});
                    msg.payload = { error: err };
                } else {
                    try {
                        msg.payload = JSON.parse(result);
                        node.status({fill: "green", shape: "dot", text: "complete"});
                    } catch (e) {
                        node.error("Failed to parse response: " + e);
                        node.status({fill: "red", shape: "ring", text: "error"});
                        msg.payload = { 
                            error: e.toString(),
                            raw_output: result 
                        };
                    }
                }
                node.send(msg);
            });
        });
    }
    
    // ODrive Initialize Node
    function ODriveInitializeNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.on('input', function(msg) {
            const instanceId = config.instanceId || 'default';
            const testSequence = config.testSequence !== false;
            
            const pythonCode = `
import odrive
from odrive.enums import *
import time
import json

try:
    odrv0 = odrive.find_any()
    
    # Set up initial state
    odrv0.axis0.controller.config.circular_setpoints = True
    odrv0.axis0.pos_vel_mapper.config.offset_valid = True
    odrv0.axis0.controller.config.input_mode = InputMode.PASSTHROUGH
    odrv0.axis0.requested_state = AxisState.CLOSED_LOOP_CONTROL
    odrv0.axis0.controller.config.control_mode = ControlMode.POSITION_CONTROL
    odrv0.axis0.controller.config.vel_limit = 10
    
    # Go to initial position
    odrv0.axis0.controller.input_pos = 0
    time.sleep(2)
    
    ${testSequence ? `
    # Test sequence
    odrv0.axis0.controller.input_pos = 0.25
    time.sleep(2)
    odrv0.axis0.controller.input_pos = 0.5
    time.sleep(2)
    odrv0.axis0.controller.input_pos = 0.75
    time.sleep(2)
    odrv0.axis0.controller.input_pos = 1
    ` : ''}
    
    print(json.dumps({
        "status": "initialized",
        "test_sequence": ${testSequence ? 'True' : 'False'}
    }))
    sys.stdout.flush()
except Exception as e:
    print(json.dumps({
        "status": "error",
        "error": str(e)
    }))
`;
            
            node.status({fill: "blue", shape: "dot", text: "initializing..."});
            
            executePython(pythonCode, (err, result) => {
                if (err) {
                    node.error("Initialization failed: " + err);
                    node.status({fill: "red", shape: "ring", text: "error"});
                    msg.payload = { error: err };
                } else {
                    try {
                        msg.payload = JSON.parse(result);
                        node.status({fill: "green", shape: "dot", text: "ready"});
                    } catch (e) {
                        node.error("Failed to parse response: " + e);
                        node.status({fill: "red", shape: "ring", text: "error"});
                        msg.payload = { 
                            error: e.toString(),
                            raw_output: result 
                        };
                    }
                }
                node.send(msg);
            });
        });
    }
    
    // ODrive Status Node
    function ODriveStatusNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        
        node.on('input', function(msg) {
            const instanceId = config.instanceId || 'default';
            
            const pythonCode = `
import odrive
import json
import sys

try:
    odrv0 = odrive.find_any()
    
    # Safely get error values - check each level
    axis_error = 0
    motor_error = 0
    controller_error = 0
    encoder_error = 0
    
    if hasattr(odrv0, 'axis0'):
        axis_error = getattr(odrv0.axis0, 'error', 0)
        
        if hasattr(odrv0.axis0, 'motor'):
            motor_error = getattr(odrv0.axis0.motor, 'error', 0)
            
        if hasattr(odrv0.axis0, 'controller'):
            controller_error = getattr(odrv0.axis0.controller, 'error', 0)
            
        if hasattr(odrv0.axis0, 'encoder'):
            encoder_error = getattr(odrv0.axis0.encoder, 'error', 0)
    
    # Get position and velocity safely
    position = 0
    velocity = 0
    
    # Try different methods to get position/velocity
    if hasattr(odrv0.axis0, 'pos_vel_mapper'):
        try:
            position = odrv0.axis0.pos_vel_mapper.pos_rel
            velocity = odrv0.axis0.pos_vel_mapper.vel
        except:
            pass
    
    if position == 0 and hasattr(odrv0.axis0, 'encoder'):
        try:
            position = odrv0.axis0.encoder.pos_estimate
            velocity = odrv0.axis0.encoder.vel_estimate
        except:
            pass
            
    # For newer ODrive versions, try alternative methods
    if position == 0:
        try:
            position = odrv0.axis0.controller.input_pos
        except:
            pass
    
    # Get current safely
    current = 0
    try:
        if hasattr(odrv0.axis0, 'motor'):
            if hasattr(odrv0.axis0.motor, 'foc'):
                current = odrv0.axis0.motor.foc.Iq_measured
            elif hasattr(odrv0.axis0.motor, 'current_control'):
                current = odrv0.axis0.motor.current_control.Iq_measured
    except:
        pass
    
    # Get controller mode safely
    controller_mode = "unknown"
    try:
        controller_mode = odrv0.axis0.controller.config.control_mode
    except:
        pass
    
    result = {
        "status": "connected",
        "vbus_voltage": odrv0.vbus_voltage,
        "axis_state": odrv0.axis0.current_state,
        "position": position,
        "velocity": velocity,
        "current": current,
        "controller_mode": controller_mode,
        "errors": {
            "axis": axis_error,
            "motor": motor_error,
            "controller": controller_error,
            "encoder": encoder_error
        }
    }
    print(json.dumps(result))
except Exception as e:
    result = {"status": "error", "error": str(e)}
    print(json.dumps(result))
`;
            
            executePython(pythonCode, (err, result) => {
                if (err) {
                    node.error("Failed to get status: " + err);
                    msg.payload = { error: err };
                } else {
                    try {
                        msg.payload = JSON.parse(result);
                    } catch (e) {
                        node.error("Failed to parse response: " + e);
                        msg.payload = { 
                            error: e.toString(),
                            raw_output: result 
                        };
                    }
                }
                node.send(msg);
            });
        });
    }
    
    // Register nodes
    RED.nodes.registerType("odrive-connection", ODriveConnectionNode);
    RED.nodes.registerType("odrive-config", ODriveConfigNode);
    RED.nodes.registerType("odrive-motor-control", ODriveMotorControlNode);
    RED.nodes.registerType("odrive-spin-coater", ODriveSpinCoaterNode);
    RED.nodes.registerType("odrive-initialize", ODriveInitializeNode);
    RED.nodes.registerType("odrive-status", ODriveStatusNode);
}