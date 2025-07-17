# Node-RED ODrive Palette

A comprehensive Node-RED palette for controlling ODrive motor controllers, with special support for spin coating applications.

## Features

- 🔌 **ODrive Connection** - Easy USB connection management
- ⚙️ **Motor Configuration** - Full parameter configuration support
- 🎯 **Position/Velocity Control** - Flexible motor control modes
- 🌀 **Spin Coating** - Dedicated spin coating cycle automation
- 📊 **Status Monitoring** - Real-time motor and controller status
- 🚀 **Initialization** - Automated initialization with optional test sequence

## Prerequisites

- Node-RED installed
- Python 3.x installed
- ODrive Python library (`pip install odrive`)
- ODrive motor controller connected via USB

## Installation

### From npm
```bash
cd ~/.node-red
npm install node-red-contrib-odrive
```

### From source
```bash
cd ~/.node-red
git clone https://github.com/corndog2000/node-red-contrib-odrive.git
cd node-red-contrib-odrive
npm install
npm link
cd ~/.node-red
npm link node-red-contrib-odrive
```

Restart Node-RED after installation.

## Nodes Overview

### 1. ODrive Connect
Establishes connection to the ODrive controller.

**Inputs:**
- Any message triggers connection attempt

**Outputs:**
- `payload.status`: Connection status
- `payload.vbus_voltage`: Bus voltage
- `payload.serial_number`: ODrive serial number

### 2. ODrive Config
Configures all ODrive parameters including motor, controller, and safety limits.

**Configuration Options:**
- DC Bus parameters (over/under voltage, current limits)
- Motor parameters (type, pole pairs, torque constant)
- Current limits (soft/hard max)
- Controller gains
- Encoder configuration

### 3. ODrive Motor Control
Controls motor in position or velocity mode.

**Inputs:**
- `msg.controlMode`: "position" or "velocity"
- `msg.value`: Target position (turns) or velocity (turns/sec)
- `msg.velRampRate`: Acceleration rate
- `msg.velLimit`: Maximum velocity

**Outputs:**
- Current and target position/velocity

### 4. ODrive Spin Coater
Executes a complete spin coating cycle.

**Parameters:**
- `motorRpm`: Target RPM (default: 1500)
- `acceleration`: Ramp rate (default: 16.67 rev/s²)
- `spinTime`: Duration in seconds (default: 40)

**Sequence:**
1. Ramps to target RPM
2. Maintains speed for specified duration
3. Ramps down to stop
4. Returns to home position

### 5. ODrive Initialize
Initializes the ODrive with optional test sequence.

**Options:**
- `testSequence`: Run 0.25, 0.5, 0.75, 1.0 turn test

### 6. ODrive Status
Retrieves comprehensive ODrive status.

**Outputs:**
- Position, velocity, current
- Controller mode and state
- Error flags for axis, motor, controller, encoder
- Bus voltage

## Usage Examples

### Basic Position Control
```
[Inject] → [ODrive Connect] → [ODrive Config] → [ODrive Initialize] → [ODrive Motor Control (position)]
```

### Spin Coating Application
```
[Inject] → [ODrive Connect] → [ODrive Config] → [ODrive Initialize] → [Trigger] → [ODrive Spin Coater]
```

### Status Monitoring
```
[Inject (repeat)] → [ODrive Status] → [Debug/Dashboard]
```

## Example Flow

```json
[
    {
        "id": "connect-odrive",
        "type": "odrive-connection",
        "name": "Connect to ODrive",
        "instanceId": "default"
    },
    {
        "id": "config-odrive",
        "type": "odrive-config",
        "name": "Configure Motor",
        "instanceId": "default",
        "motorRpm": 1500,
        "polePairs": 7
    },
    {
        "id": "spin-cycle",
        "type": "odrive-spin-coater",
        "name": "Spin Coat",
        "instanceId": "default",
        "motorRpm": 1500,
        "spinTime": 40
    }
]
```

## Advanced Configuration

### Multiple ODrive Support
Use different `instanceId` values to control multiple ODrives:
```
ODrive 1: instanceId = "odrive1"
ODrive 2: instanceId = "odrive2"
```

### Dynamic Parameters
All node parameters can be overridden via `msg` properties:
```javascript
msg.motorRpm = 2000;
msg.spinTime = 60;
msg.acceleration = 20;
```

### Error Handling
All nodes output error information in `msg.payload.error` when failures occur.
