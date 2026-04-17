alter table scenarios
add constraint scenarios_created_by_name_key unique (created_by, name);
