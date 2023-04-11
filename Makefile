all:
	cd cli-app && poetry install

install:
	rm -f /usr/local/bin/mapboard
	ln -s $(PWD)/mapboard-cli/bin/mapboard /usr/local/bin/mapboard