# Flagger
This is the service for collecting and sending flags on classic CTF competitions. It was used on RuCTF 2017 by our CTF team [[censored]](https://ctftime.org/team/558).

## If you aren't familiar with what CTF is
Classic CTF (Capture The Flag) or "attack-defence CTF" is a competition in the computer security field. The game is set with multiple teams having their own respective network or a single host with vulnerable services. During the preparation time teams are expected to develop their exploits for offence and patches to fix their vulnerabilities. When the allotted preparation time is up, the organizers connect the participants and the wargame begins. Your objective is to protect your own services to gain defence points and to hack opponents to steal their flags (secret data) for attack points.

## What problem this project solves
When classic CTF is organized online there are many participating teams from all over the world and organizers often don't have the resources to provide 100% reliable infrastructure for their flags receiving service. Following connection issues often occur: lost packets, connection drops, etc. This service will store your commands flags and reliably send them to the receiver when it is available. At the same time it keeps records about all flags status.

## Structure
* `src` - contains flagger sources
  * `src/config.js` - flagger's configuration file
* `tests` - basic tests for correctness and throughput
  * `tests/console_receiver.js` - simple script, which emulates flag receiver and prints received flags to console
* `emulator` - contains files for starting Docker container, which emulates organizers receiver service
  * `emulator/internet` - bash script for emulation of bad connection (using *tc* Linux utility)
* `random_flag.sh` - bash script for generating flags-like string

## Usage
Keep in mind that service was only tested on LTS:Boron version of Node.JS.

#### Build
```
npm install
npm run build
```

#### Start
* Start MongoDB database. For example, with disposable Docker container:
```
docker run --rm -d -p 27017-27019:27017-27019 --name mongodb mongo
```
* *(optionaly)* Start receiver server from `emulator` or `tests` directory. Exact commands depend on your network configuration.
* Change parameters accordingly in `src/config.js`
* Start flagger:
```
npm run start
```

#### Do tests
```
npm run test
```
