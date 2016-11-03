FROM ubuntu:14.04

RUN echo 'Acquire::http { Proxy "http://172.17.0.1:3142"; };' > /etc/apt/apt.conf.d/02proxy
RUN apt-get update
RUN apt-get install -y curl
RUN curl -sL https://deb.nodesource.com/setup_6.x | sudo -E bash -
RUN apt-get install -y nodejs

ADD entrypoint.sh /entrypoint.sh

CMD ["/bin/bash", "entrypoint.sh"]
