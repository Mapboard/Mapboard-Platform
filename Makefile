all:
	pip install "poetry>=1.5.1"
	python -m venv .venv
	poetry lock --no-update && poetry install

install:
	-rm -f /usr/local/bin/mapboard
	sudo ln -s $(PWD)/bin/mapboard /usr/local/bin/mapboard
